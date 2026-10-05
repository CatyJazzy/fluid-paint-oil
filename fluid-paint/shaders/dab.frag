// [atelier] 고정 붓 마스크와 캔버스 결을 읽어 물감(또는 속도)을 놓는다.
//
// 색은 마스크에 굽지 않는다. 회색조 마스크가 현재 물감 색을 통과시킬 뿐이다.
// (Krita 의 Alpha Mask 모드와 같다)

precision highp float;

uniform sampler2D u_tipTexture;
uniform sampler2D u_grainTexture;
uniform float u_grainScale;
uniform float u_grainStrength;
// 이 두께를 넘으면 결이 완전히 묻힌다
uniform float u_grainFadeAt;

varying vec2 v_tipCoordinates;
varying vec2 v_canvasPosition;
varying float v_alpha;
varying vec2 v_velocity;
varying float v_broad;

#ifdef VELOCITY
uniform float u_velocityScale;
#elif defined(HEIGHT)
// [atelier] 두께만 올리는 패스. 색 칠하기와 따로 논다.
uniform float u_thickness;
// 가장자리가 떨어지는 폭. 좁을수록 낭떠러지가 선다
uniform float u_edgeWidth;
// 몸통 안에 붓털 자국을 얼마나 남길지
uniform float u_streak;
#else
uniform vec4 u_splatColor;
// [atelier] 붓이 물고 있는 색. rgb 는 색, a 는 얼마나 물고 있는지.
uniform sampler2D u_smudgeTexture;
uniform float u_smudge;
#endif

void main () {
    // 붓 모양. 캔버스 결이 섞이기 전의 순수한 붓자국이다.
    float shape = texture2D(u_tipTexture, v_tipCoordinates).r * v_alpha;

    // 캔버스 결. 캔버스 좌표로 읽으므로 획을 겹쳐도 같은 골이 반복해서 비어 있다.
    // (조사 문서 §5.2 CanvasLocked)
    //
    // 다만 **두껍게 얹는 자리에서는 결이 묻혀야 한다.** 물감을 넉넉히 문 붓은
    // 캔버스 올을 덮고 지나간다. 결을 늘 곱하면 어떤 붓으로 그어도 크레파스처럼
    // 바탕이 비친다 — 조사 문서 §5.4 가 경고하는 그대로다.
    float grain = 1.0;
    if (u_grainStrength > 0.0) {
        float weave = texture2D(u_grainTexture, v_canvasPosition * u_grainScale).r;
        float thin = 1.0 - smoothstep(0.0, u_grainFadeAt, shape);
        grain = mix(1.0, weave, u_grainStrength * thin);
    }

    float mask = shape * grain;

    if (mask <= 0.0) discard;

#ifdef VELOCITY
    // 원본은 감쇠를 속도에 안 곱했다. 곱해 두면 붓 가장자리가 물감을 덜 밀어
    // 획이 덜 미끌거린다.
    gl_FragColor = vec4(v_velocity * u_velocityScale * mask, 0.0, mask);
#elif defined(HEIGHT)
    // 두께는 색 농도와 따로 쌓는다.
    //
    // 한 장짜리 물감 텍스처에서 a 는 두께인데, 색을 덮는 비율로도 같이 쓰인다.
    // 그래서 두께를 올리려고 a 를 키우면 dab 하나가 색을 통째로 덮어 버려
    // 겹쳐 쌓는 맛이 사라진다. 원본은 붓털 100 가닥이 각각 0.025 씩 얹어
    // **색은 부드럽게 겹치고 두께는 크게** 쌓았다 — 고정 붓 한 번으로는
    // 그 둘을 한 값으로 낼 수 없다. 그래서 패스를 나눈다.
    //
    // 모양은 **평평한 고원**이다. 실제 유화 획을 보면 입체로 읽히는 것은
    // 몸통의 요철이 아니라 **가장자리의 낭떠러지**다 — 거기서 법선이 크게 꺾여
    // 테두리에 어두운 선이 생긴다. 몸통을 오돌토돌하게 만들면 오히려
    // 사포처럼 잘게 반짝여서 크레파스로 보인다.
    float body = smoothstep(0.0, u_edgeWidth, shape);

    // 붓털 자국은 몸통 안에서 얕게만. 색에서까지 깊게 파면 붓털 사이로
    // 캔버스가 비쳐 크레파스가 된다. 두꺼운 물감의 붓자국은 물감 표면의
    // 골이지 캔버스까지 뚫린 구멍이 아니다.
    float streak = mix(1.0, shape, u_streak);

    // 캔버스 결은 거의 빼고 본다. 결까지 두께로 옮기면 긴 고랑이 아니라
    // 사포처럼 잘게 반짝인다. 결은 물감이 **덜 묻는** 층이지 물감 표면을
    // 깎는 층이 아니다. (조사 문서 §5.4 — coverage / height / lighting 을
    // 한 손잡이에 묶지 말 것)
    const float GRAIN_ON_HEIGHT = 0.3;

    gl_FragColor = vec4(0.0, 0.0, 0.0,
        body * streak * mix(1.0, grain, GRAIN_ON_HEIGHT) * u_thickness);
#else
    // 집어 온 색과 팔레트 색을 섞는다. u_smudge 가 0 이면 팔레트 색 그대로다.
    //
    // 붓 폭을 따라 **다른 색**을 문다. 붓 하나가 색 하나만 물면 섞인 자리가
    // 고르게 한 가지 보라가 되는데, 실제 유화는 붓의 이쪽과 저쪽이 다른 색을
    // 물고 있어서 얼룩덜룩하게 섞인다. 붓털을 한 가닥씩 시뮬레이션하지 않고
    // 그 상태를 내는 것이 libmypaint 의 smudge_bucket 이다.
    vec4 picked = texture2D(u_smudgeTexture, vec2(v_broad, 0.5));
    vec3 colour = mix(u_splatColor.rgb, picked.rgb, u_smudge * picked.a);

    gl_FragColor = vec4(colour, u_splatColor.a * mask);
#endif
}
