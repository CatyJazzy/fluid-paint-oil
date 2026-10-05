// [atelier] 고정 붓 한 번(dab)을 사각형으로 펼친다.
//
// 원본(splat.vert)은 붓털 마디의 위치 텍스처를 읽어 궤적 캡슐을 만들었다.
// 여기서는 붓 모양이 고정이므로 위치 텍스처가 필요 없다.

precision highp float;

attribute vec2 a_corner;   // -1 .. 1
attribute vec4 a_dab;      // x, y, radius, aspect
attribute vec4 a_extra;    // angle, alpha, velocity.x, velocity.y
attribute vec2 a_tip;      // 아틀라스에서 이 dab 이 쓸 칸 (0 또는 0.5)

uniform vec2 u_paintingDimensions;
uniform vec2 u_paintingPosition;

varying vec2 v_tipCoordinates;
varying vec2 v_canvasPosition;
varying float v_alpha;
varying vec2 v_velocity;
// [atelier] 붓 폭 방향 위치 0~1. 붓이 폭을 따라 다른 색을 물기 위한 것이다.
varying float v_broad;

void main () {
    float c = cos(a_extra.x);
    float s = sin(a_extra.x);

    // libmypaint 의 elliptical_dab_ratio 와 같은 뜻이다.
    // aspect 가 1이면 원, 커질수록 진행 방향으로 얇아져 납작붓이 된다.
    vec2 local = a_corner * vec2(a_dab.z / a_dab.w, a_dab.z);
    vec2 rotated = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    vec2 position = a_dab.xy + rotated;

    // 마스크는 2×2 아틀라스다. dab 마다 다른 칸을 써야 자국이 반복되지 않는다.
    v_tipCoordinates = a_tip + (a_corner * 0.5 + 0.5) * 0.5;

    // 캔버스 결은 붓이 아니라 캔버스에 붙어 있다. 그래서 캔버스 좌표가 필요하다.
    v_canvasPosition = position;

    // local.y 가 붓의 넓은 축이고 회전 뒤에는 진행 방향과 수직이 된다
    v_broad = a_corner.y * 0.5 + 0.5;

    v_alpha = a_extra.y;
    v_velocity = a_extra.zw;

    gl_Position = vec4(-1.0 + 2.0 * (position - u_paintingPosition) / u_paintingDimensions, 0.0, 1.0);
}
