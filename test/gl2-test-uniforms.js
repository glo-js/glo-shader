var test = require('tape')

var createShader = require('../')
var createContext = require('get-canvas-context')

var fs = require('fs')
var vert = fs.readFileSync(__dirname + '/fixtures/webgl2.vert','utf8')
var frag = fs.readFileSync(__dirname + '/fixtures/webgl2.frag','utf8')
var expected = require('./fixtures/webgl2-types.json')

test('shader should compile webgl2', function (t) {
  var gl = createContext('webgl2')
  var shader = createShader(gl, {
    quiet: true,
    vertex: vert,
    fragment: frag
  })

  // Chrome 43 is having trouble with these (sorta work in Canary)
  t.deepEqual(shader.uniforms.blah2(), [0,0,0,0,0,0,0,0,0])
  // t.deepEqual(shader.uniforms.blah(), [0,0,0,0,0,0])
  // t.deepEqual(shader.uniforms.iChannel1(), 0)
  
  t.deepEqual(shader.types.attributes, expected.attributes)
  t.deepEqual(shader.types.uniforms, expected.uniforms)

  shader.dispose()
  gl = null
  shader = null
  t.end()
})