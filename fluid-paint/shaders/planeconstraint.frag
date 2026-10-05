precision highp float;

uniform vec2 u_resolution;

uniform sampler2D u_positionsTexture;

// [atelier] 붓털이 붓대에서 얼마나 멀어질 수 있는가.
//
// 원본은 z(캔버스) 제약만 있었다. 붓을 누르면 붓털이 평면에 밀려 사방으로
// 퍼지고, 한 올 한 올이 제 갈 길로 뻗어 별처럼 흩어진다. 실제 붓은 털이
// 묶여 있어서 눌러도 다발이 유지된다.
uniform vec2 u_brushPosition;
uniform float u_maxRadius;

void main () {
    vec2 coordinates = gl_FragCoord.xy / u_resolution;

    vec3 position = texture2D(u_positionsTexture, coordinates).rgb;

    if (position.z < 0.0) position.z *= 0.5;

    // 붓대에서 너무 멀어진 털은 끌어당긴다. 딱 자르지 않고 부드럽게 눌러
    // 가장자리 털이 조금 삐져나오는 여지는 남긴다.
    if (u_maxRadius > 0.0) {
        vec2 offset = position.xy - u_brushPosition;
        float dist = length(offset);
        if (dist > u_maxRadius) {
            float over = dist - u_maxRadius;
            float pulled = u_maxRadius + over * 0.25;
            position.xy = u_brushPosition + offset * (pulled / max(dist, 0.0001));
        }
    }

    gl_FragColor = vec4(position, 1.0);

}
