precision highp float;

uniform int u_pass; //0 or 1, in pass 0 we do 0-1, 2-3, 4-5..., in pass 1 we do 1-2, 3-4, 5-6...

uniform vec2 u_resolution;

uniform sampler2D u_positionsTexture;
uniform float u_pointCount;

uniform float u_targetDistance;

uniform float u_pinnedCount; // [atelier] 고정할 마디 수 (1 이면 원본과 같다)

void main () {
    vec2 coordinates = gl_FragCoord.xy / u_resolution;

    float index = floor(gl_FragCoord.y); //which vertex on the bristle

    // [atelier] 원본은 뿌리(0번)만 고정했다. 그러면 붓대 방향이 매 프레임
    // 중력과 속도에 휘둘려 붓이 흐물거린다. 첫 **마디**(0-1)를 고정하면
    // 붓을 쥔 각도가 유지되고, 그 아래 붓털만 눌려 휜다.
    float myWeight = 1.0;
    if (index < u_pinnedCount - 0.9) myWeight = 0.0;

    vec3 myPosition = texture2D(u_positionsTexture, vec2(coordinates.x, (index + 0.5) / u_pointCount)).rgb;

    float otherIndex = 0.0;

    if (mod(index, 2.0) < 0.01) {
        if (u_pass == 0) {
            otherIndex = index + 1.0;
        } else {
            otherIndex = index - 1.0;
        }
    } else {
        if (u_pass == 0) {
            otherIndex = index - 1.0;
        } else {
            otherIndex = index + 1.0;
        }
    }

    float otherWeight = 1.0;
    if (otherIndex < u_pinnedCount - 0.9) otherWeight = 0.0;

    vec3 newPosition = myPosition;

    if (otherIndex >= 0.0 && otherIndex < u_pointCount) {
        vec3 otherPosition = texture2D(u_positionsTexture, vec2(coordinates.x, (otherIndex + 0.5) / u_pointCount)).rgb;

        float currentDistance = distance(myPosition, otherPosition);
        vec3 towards = (otherPosition - myPosition) / max(currentDistance, 0.01);

        // [atelier] 둘 다 고정된 쌍(0-1)에서는 분모가 0 이 된다. 원본은 한쪽만
        // 고정해서 생기지 않던 경우다. 막지 않으면 NaN 이 붓털을 타고 번져
        // 좌표가 통째로 날아간다.
        float weightSum = max(myWeight + otherWeight, 0.0001);

        newPosition = myPosition + (myWeight / weightSum) * (currentDistance - u_targetDistance) * towards;
    } 

    gl_FragColor = vec4(newPosition, 1.0);

}
