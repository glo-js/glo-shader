#version 300 es

in vec2 uv;
in vec3 normal;
in vec4 position;
uniform mat4 projection;
uniform mat4 view;
uniform mat4 model;

out vec3 vNormal;
out vec2 vUv;

uniform mat2x3 blah;
uniform mat3x3 blah2;

void main() {
  float f = blah[0].x + blah[1].y + blah2[0].y;
  vUv = uv;
  vNormal = normal;
  gl_Position = projection * view * model * position;
  gl_PointSize = f;
}
