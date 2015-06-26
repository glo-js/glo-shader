#version 300 es
precision mediump float;

out vec4 fragOut;
in vec2 vUv;
in vec3 vNormal;
uniform sampler2D iChannel0;
uniform sampler3D tLookupTable;
uniform usampler2D iChannel1;
uniform uint foo;

void main() {
  vec4 blah = vec4(texture(iChannel1, vUv));

  fragOut = texture(iChannel0, vUv * vec2(4.0, 1.0));
}