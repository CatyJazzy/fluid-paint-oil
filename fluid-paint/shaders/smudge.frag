// [atelier] 붓이 물고 있는 색을 갱신한다.
//
// 붓털 시뮬레이션을 버리면서 "붓이 캔버스 색을 집어 온다"는 감각이 같이 사라졌다.
// libmypaint 의 smudge 모델로 그 자리를 메운다.
//
//   smudge         집어 온 색으로 칠하는 비율 (0 이면 팔레트 색 그대로)
//   smudge_length  집어 온 색이 캔버스 색으로 바뀌는 속도. 0 이면 즉시
//   smudge_radius  색을 집어 오는 원의 크기
//
// 한 픽셀짜리 타깃에 그린다. 붓이 지금 물고 있는 색 하나다.

precision highp float;

uniform sampler2D u_paintTexture;
uniform sampler2D u_previousSmudge;

uniform vec2 u_brushPosition;   // 시뮬레이션 uv
uniform vec2 u_radius;          // 집어 오는 반지름 (uv)
uniform float u_smudgeLength;

// [atelier] 붓 폭 방향 반 길이 (uv). 칸마다 이 방향으로 어긋난 자리를 본다.
uniform vec2 u_across;
uniform float u_cells;

void main () {
    // 이 칸이 붓 폭의 어디를 맡는지. -1 이 한쪽 끝, +1 이 반대쪽 끝이다.
    float cell = floor(gl_FragCoord.x);
    float t = (cell + 0.5) / u_cells * 2.0 - 1.0;
    vec2 centre = u_brushPosition + u_across * t;

    // 붓 아래를 고르게 훑는다. 한 점만 보면 색이 톡톡 튄다.
    const int TAPS = 9;
    vec2 offsets[TAPS];
    offsets[0] = vec2( 0.0,  0.0);
    offsets[1] = vec2( 1.0,  0.0);
    offsets[2] = vec2(-1.0,  0.0);
    offsets[3] = vec2( 0.0,  1.0);
    offsets[4] = vec2( 0.0, -1.0);
    offsets[5] = vec2( 0.7,  0.7);
    offsets[6] = vec2(-0.7,  0.7);
    offsets[7] = vec2( 0.7, -0.7);
    offsets[8] = vec2(-0.7, -0.7);

    vec3 colourSum = vec3(0.0);
    float weightSum = 0.0;
    float coverSum = 0.0;

    for (int i = 0; i < TAPS; ++i) {
        vec2 uv = centre + offsets[i] * u_radius;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;

        vec4 paint = texture2D(u_paintTexture, uv);
        // 물감이 두껍게 얹힌 곳의 색을 더 무겁게 본다.
        float weight = min(paint.a, 1.0);
        colourSum += paint.rgb * weight;
        weightSum += weight;
        coverSum += min(paint.a, 1.0);
    }

    vec4 previous = texture2D(u_previousSmudge, vec2((cell + 0.5) / u_cells, 0.5));

    // 아무것도 안 칠해진 자리를 지나면 집어 올 것이 없다.
    float found = coverSum / float(TAPS);
    if (weightSum <= 0.0001) {
        // 물고 있던 색은 천천히 잊는다. 빈 캔버스를 오래 지나면 붓이 깨끗해진다.
        gl_FragColor = vec4(previous.rgb, previous.a * u_smudgeLength);
        return;
    }

    vec3 canvasColour = colourSum / weightSum;

    // smudgeLength 가 0 이면 즉시 캔버스 색이 되고, 1 에 가까우면 천천히 물든다.
    vec3 blended = mix(canvasColour, previous.rgb, previous.a > 0.0001 ? u_smudgeLength : 0.0);
    float amount = mix(found, previous.a, u_smudgeLength);

    gl_FragColor = vec4(blended, clamp(amount, 0.0, 1.0));
}
