var compileShader = require('./lib/compile-shader')
var linkShaders = require('./lib/link-program')
var extract = require('gl-shader-extract')
var reflect = require('glsl-extract-reflect')
var getter = require('dprop')
var indexOfName = require('indexof-property')('name')

var defaultVertex = 'attribute vec4 position; void main() { gl_Position = position; gl_PointSize = 1.0; }'
var defaultFragment = 'precision mediump float; void main() { gl_FragColor = vec4(1.0); }'

module.exports = createShader
function createShader (gl, opt) {
  opt = opt || {}
  var program = gl.createProgram()
  var vertexShader, fragmentShader
  var types, uniforms, attributes, uniformPathDict
  var name = opt.name || ''

  var shader = {
    dispose: disposeProgram,
    bind: bind,
    update: update
  }

  // compile the program
  update(opt)

  // public read-only vars
  Object.defineProperties(shader, {
    handle: getter(function () {
      return program
    }),
    vertexShader: getter(function () {
      return vertexShader
    }),
    fragmentShader: getter(function () {
      return fragmentShader
    }),
    types: getter(function () {
      return types
    }),
    uniforms: getter(function () {
      return uniforms
    }),
    attributes: getter(function () {
      return attributes
    })
  })

  return shader

  function bind () {
    gl.useProgram(program)
  }

  function disposeShaders () {
    if (vertexShader) {
      gl.detachShader(program, vertexShader)
      gl.deleteShader(vertexShader)
    }
    if (fragmentShader) {
      gl.detachShader(program, fragmentShader)
      gl.deleteShader(fragmentShader)
    }
  }

  function disposeProgram () {
    disposeShaders()
    gl.deleteProgram(program)
  }

  // reload shader with new source code
  function update (opt) {
    // remove old shaders
    disposeShaders()

    var quiet = opt.quiet
    var attributeBindings = opt.attributes

    var vertSrc = opt.vertex || defaultVertex
    var fragSrc = opt.fragment || defaultFragment

    // re-compile source
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertSrc, quiet, name)
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc, quiet, name)

    // re-link
    var shaders = [ vertexShader, fragmentShader ]
    linkShaders(gl, program, shaders, attributeBindings, quiet, name)

    // extract uniforms and attributes
    types = extract(gl, program)

    // allow user to inject some dummy uniforms
    if (opt.uniforms) {
      var inactiveUniforms = []
      opt.uniforms.forEach(function (uniform) {
        if (indexOfName(types.uniforms, uniform.name) === -1) {
          inactiveUniforms.push(uniform)
          types.uniforms.push({ name: uniform.name, type: uniform.type })
        }
      })

      // provide UX for inactive uniforms...? TBD
      if (!quiet) {
        var shaderName = name ? (' (' + name + ')') : ''
        console.warn('Inactive uniforms in shader' + shaderName + ': ' 
            + inactiveUniforms
              .map(function (x) { return x.name })
              .join(', '))
      }
    }
    
    // normalize sort order by name across Chrome / FF
    types.uniforms.sort(compareString)
    types.attributes.sort(compareString)

    // bind shader before setting optional default values
    bind()

    // provide optimized getters/setters
    uniformPathDict = {}
    uniforms = reflect(types.uniforms, function (uniform, index) {
      var prop = makeUniformProp(uniform, index)
      uniformPathDict[uniform.path] = prop
      return prop
    })

    // provide attribute locations and type
    // (GLSL ES does not support array/struct attributes)
    attributes = types.attributes.reduce(function (struct, attrib) {
      var name = attrib.name
      struct[name] = {
        size: dimension(attrib.type),
        type: attrib.type,
        location: gl.getAttribLocation(program, name)
      }
      return struct
    }, {})

    // allow user to set default values for uniforms
    if (opt.uniforms) {
      opt.uniforms.forEach(function (uniform) {
        if (typeof uniform.value !== 'undefined') {
          uniformByName(uniform.name, uniform.value)
        }
      })
    }
  }

  // Currently private...
  // but may be useful to the user
  // instead of: (short name)
  //  shader.lights[0].foo(value)
  // if would be: (qualified name)
  //  shader.uniform('lights[0].foo', value)
  function uniformByName (name, value, transposed) {
    var prop = uniformPathDict[name]
    if (!prop) {
      throw new Error('no uniform found by path ' + name)
    }
    return prop(value, transposed)
  }

  function makeUniformProp (uniform) {
    /*eslint-disable no-new-func*/
    var path = uniform.path
    var type = uniform.type
    var location = gl.getUniformLocation(program, path)
    var setter = getPropSetter(path, location, type)
    
    var generated = new Function('self', 'gl', 'program', 'location', [
      'return function uniformGetSet (value, transposed) {',
        '\tif (typeof value === "undefined")',
          '\t\treturn location ? gl.getUniform(program, location) : undefined',
        '\telse {',
          '\t\tif (location)',
          '\t\t\t' + setter,
          '\t\treturn self',
        '\t}',
      '}'
    ].join('\n'))
    return generated(shader, gl, program, location)
  }
}

function compareString (a, b) {
  return a.name.localeCompare(b.name)
}

function getPropSetter (path, location, type) {
  // simple primitive types
  switch (type) {
    case 'bool':
    case 'int':
      return 'gl.uniform1i(location, value)'
    case 'float':
      return 'gl.uniform1f(location, value)'
    case 'uint':
      return 'gl.uniform1ui(location, value)'
  }

  // sampler type
  if (/^(u|i)?sampler(2D|3D|Cube|2DArray)$/.test(type)) {
    return 'gl.uniform1i(location, value)'
  }

  // complex matrix type, e.g. mat4x3
  if (/^mat[0-9]x[0-9]$/.test(type)) {
    var dims = type.substring(type.length - 3)
    return 'gl.uniformMatrix' + dims + 'fv(location, Boolean(transposed), value)'
  }

  // simple type
  var vecIdx = type.indexOf('vec')
  var count = dimension(type)
  if (vecIdx === 0 || vecIdx === 1) {
    var vtype = type.charAt('0')
    switch (vtype) {
      case 'b':
      case 'i':
        return 'gl.uniform' + count + 'iv(location, value)'
      case 'u':
        return 'gl.uniform' + count + 'uiv(locaiton, value)'
      case 'v': // regular vecN
        return 'gl.uniform' + count + 'fv(location, value)'
      default:
        throw new Error('unrecognized uniform type ' + type + ' for ' + path)
    }
  } else if (type.indexOf('mat') === 0 && type.length === 4) {
    return 'gl.uniformMatrix' + count + 'fv(location, Boolean(transposed), value)'
  } else {
    throw new Error('unrecognized uniform type ' + type + ' for ' + path)
  }
}

function dimension (type) {
  return parseInt(type.charAt(type.length - 1), 10) || 1
}
