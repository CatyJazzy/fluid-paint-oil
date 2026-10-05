// [atelier] 색 고르개.
//
// 원본은 색상환(고리) 안에 채도·명도 정사각형을 넣은 모양이었다. 고리 안에
// 내접하는 정사각형이라 실제로 집을 수 있는 면적이 고리 지름의 70% 밖에 안 됐다.
// 큰 사각형 하나와 세로 띠 두 개로 바꾼다 — 같은 자리에서 사각형이 3배 넓어진다.
//
//   [ 채도 · 명도 사각형 ]  [색상][불투명도]

precision highp float;

varying vec2 v_coordinates; //in [-1, 1]

uniform vec4 u_currentHSVA;

uniform vec2 u_squarePosition;   //bottom left
uniform vec2 u_squareDimensions;

uniform vec2 u_hueSliderPosition;
uniform vec2 u_hueSliderDimensions;

uniform vec2 u_alphaSliderPosition;
uniform vec2 u_alphaSliderDimensions;

vec3 trilinearInterpolate(vec3 p, vec3 v000, vec3 v100, vec3 v010, vec3 v001, vec3 v101, vec3 v011, vec3 v110, vec3 v111) {
    return v000 * (1.0 - p.x) * (1.0 - p.y) * (1.0 - p.z) +
           v100 * p.x * (1.0 - p.y) * (1.0 - p.z) +
           v010 * (1.0 - p.x) * p.y * (1.0 - p.z) +
           v001 * (1.0 - p.x) * (1.0 - p.y) * p.z +
           v101 * p.x * (1.0 - p.y) * p.z +
           v011 * (1.0 - p.x) * p.y * p.z +
           v110 * p.x * p.y * (1.0 - p.z) +
           v111 * p.x * p.y * p.z;
}

vec3 rybToRgb(vec3 ryb) {
#ifdef RGB
    return 1.0 - ryb.yxz;
#endif

    return trilinearInterpolate(ryb, 
        vec3(1.0, 1.0, 1.0), 
        vec3(1.0, 0.0, 0.0), 
        vec3(0.163, 0.373, 0.6), 
        vec3(1.0, 1.0, 0.0), 
        vec3(1.0, 0.5, 0.0), 
        vec3(0.0, 0.66, 0.2),
        vec3(0.5, 0.0, 0.5),
        vec3(0.2, 0.094, 0.0));
}

vec3 hsv2ryb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 hsvToRgb (vec3 hsv) {
    return rybToRgb(hsv2ryb(hsv));
}

float circleStrokeAlpha (vec2 position, vec2 center, float innerRadius, float outerRadius, float feather) {
    float dist = distance(center, position);
    return smoothstep(innerRadius - feather, innerRadius, dist) * smoothstep(outerRadius + feather, outerRadius, dist);
}

float boxAlpha (vec2 position, vec2 bottomLeft, vec2 dimensions, vec2 feather) {
    vec2 center = bottomLeft + dimensions * 0.5;
    vec2 distances = max(abs(position - center) - dimensions * 0.5, vec2(0.0, 0.0));

    return smoothstep(feather.x, 0.0, distances.x) * smoothstep(feather.y, 0.0, distances.y);
}

float boxStrokeAlpha (vec2 position, vec2 bottomLeft, vec2 dimensions, vec2 strokeWidth, vec2 feather) {
    return boxAlpha(position, bottomLeft - strokeWidth * 0.5, dimensions + strokeWidth, feather) *
           (1.0 - boxAlpha(position, bottomLeft + strokeWidth * 0.5, dimensions - strokeWidth, feather));
}

/** 세로 띠에서의 위치를 0~1 로. 위가 0 이다 (그림판류의 관행). */
float verticalT (vec2 position, vec2 bottomLeft, vec2 dimensions) {
    return clamp(1.0 - (position.y - bottomLeft.y) / dimensions.y, 0.0, 1.0);
}

// ── 채도·명도 사각형 ─────────────────────────────────────────
// 가로가 채도, 세로가 명도다.

vec4 sbSquare () {
    vec2 local = v_coordinates - u_squarePosition;

    float saturation = clamp(local.x / u_squareDimensions.x, 0.0, 1.0);
    float value      = clamp(local.y / u_squareDimensions.y, 0.0, 1.0);

    vec3 rgb = hsvToRgb(vec3(u_currentHSVA.x, saturation, value));
    float alpha = boxAlpha(v_coordinates, u_squarePosition, u_squareDimensions, vec2(0.6));

    return vec4(rgb, alpha);
}

vec4 sbIndicator () {
    float radius = 7.0;

    vec2 position = u_squarePosition + vec2(
        u_currentHSVA.y * u_squareDimensions.x,
        u_currentHSVA.z * u_squareDimensions.y);

    // 밝은 색 위에서도 보이게 흰 고리 안쪽에 검은 고리를 겹친다
    float white = circleStrokeAlpha(v_coordinates, position, radius, radius + 2.0, 1.2);
    float black = circleStrokeAlpha(v_coordinates, position, radius + 2.0, radius + 3.2, 1.2);

    return vec4(vec3(1.0) * white, max(white, black * 0.55));
}

// ── 색상 띠 ─────────────────────────────────────────────────

vec4 hueSlider () {
    float alpha = boxAlpha(v_coordinates, u_hueSliderPosition, u_hueSliderDimensions, vec2(0.6));
    float hue = verticalT(v_coordinates, u_hueSliderPosition, u_hueSliderDimensions);

    return vec4(hsvToRgb(vec3(hue, 1.0, 1.0)), alpha);
}

vec4 hueIndicator () {
    float height = 5.0;
    float y = u_hueSliderPosition.y + (1.0 - u_currentHSVA.x) * u_hueSliderDimensions.y - height * 0.5;

    // 띠보다 조금 넓게 빼서 집게처럼 보이게 한다
    vec2 bottomLeft = vec2(u_hueSliderPosition.x - 3.0, y);
    vec2 dimensions = vec2(u_hueSliderDimensions.x + 6.0, height);

    float alpha = boxStrokeAlpha(v_coordinates, bottomLeft, dimensions, vec2(2.4), vec2(0.4));

    return vec4(1.0, 1.0, 1.0, alpha);
}

// ── 불투명도(물감 양) 띠 ─────────────────────────────────────

vec4 alphaSlider () {
    float alpha = boxAlpha(v_coordinates, u_alphaSliderPosition, u_alphaSliderDimensions, vec2(0.6));

    vec2 local = floor((v_coordinates - u_alphaSliderPosition) / 5.0);
    float checkerboard = mod(local.x + mod(local.y, 2.0), 2.0) * 0.05 + 0.95;

    float t = 1.0 - verticalT(v_coordinates, u_alphaSliderPosition, u_alphaSliderDimensions);
    vec3 color = mix(vec3(checkerboard), hsvToRgb(u_currentHSVA.rgb), t);

    return vec4(color, alpha);
}

vec4 alphaIndicator () {
    float height = 5.0;
    float y = u_alphaSliderPosition.y + u_currentHSVA.a * u_alphaSliderDimensions.y - height * 0.5;

    vec2 bottomLeft = vec2(u_alphaSliderPosition.x - 3.0, y);
    vec2 dimensions = vec2(u_alphaSliderDimensions.x + 6.0, height);

    float alpha = boxStrokeAlpha(v_coordinates, bottomLeft, dimensions, vec2(2.4), vec2(0.4));

    return vec4(1.0, 1.0, 1.0, alpha);
}

vec4 alphaBlend (vec4 color, vec4 source) {
    vec4 result = vec4(0.0);
    result.rgb = source.a * source.rgb + (1.0 - source.a) * color.rgb;
    result.a = 1.0 * source.a + (1.0 - source.a) * color.a;

    return result;
}

void main () {
    vec4 color = vec4(0.0, 0.0, 0.0, 0.0);

    color = alphaBlend(color, sbSquare());
    color = alphaBlend(color, sbIndicator());
    color = alphaBlend(color, hueSlider());
    color = alphaBlend(color, hueIndicator());
    color = alphaBlend(color, alphaSlider());
    color = alphaBlend(color, alphaIndicator());

    gl_FragColor = color;
}
