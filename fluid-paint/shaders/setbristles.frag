precision highp float;

uniform vec3 u_brushPosition;
uniform float u_brushScale;
uniform float u_bristleCount;

uniform float u_bristleLength; //length of total bristle
uniform float u_verticesPerBristle;

uniform sampler2D u_randomsTexture;
uniform vec2 u_resolution;

uniform float u_jitter;

// [atelier] 붓 종류를 가르는 두 값.
// 0 = 둥근붓(해바라기 배치), 1 = 납작붓(한 줄), 2 = 부채붓(가운데가 성기게)
uniform float u_layout;
// 획 폭 쪽으로 얼마나 눌린 붓인지. 1이면 안 누른 것.
uniform float u_aspect;

const float PHI = 1.618033988749895;
const float PI = 3.14159265;

void main () {
    vec2 coordinates = gl_FragCoord.xy / u_resolution;

    vec4 randoms = texture2D(u_randomsTexture, coordinates);

    float bristleIndex = floor(gl_FragCoord.x); //which bristle
    float vertexIndex = floor(gl_FragCoord.y);

    // [atelier] 심는 방식에 따라 뿌리 자리를 정한다.
    vec2 planted;

    if (u_layout < 0.5) {
        //jittered sunflower distribution
        float theta = (bristleIndex + (randoms.z - 0.5) * u_jitter) * 2.0 * PI / (PHI * PHI);
        float r = sqrt(bristleIndex + (randoms.w - 0.5) * u_jitter) / sqrt(u_bristleCount);
        planted = vec2(r * cos(theta), r * sin(theta));
    } else {
        // 한 줄로 늘어선 다발. 납작붓과 부채붓이 여기서 갈린다.
        float t = (bristleIndex + (randoms.z - 0.5) * u_jitter)
            / max(u_bristleCount - 1.0, 1.0);
        float along = clamp(t, 0.0, 1.0) * 2.0 - 1.0;

        // 부채붓은 가운데가 성기고 양 끝이 촘촘하다. 그래서 결만 남는다.
        if (u_layout > 1.5) {
            along = sign(along) * pow(abs(along), 0.6);
        }

        planted = vec2(along, (randoms.w - 0.5) * 2.0);
    }

    planted.y *= u_aspect;

    float spacing = u_bristleLength / (u_verticesPerBristle - 1.0);
    vec3 brushSpaceBristlePosition = vec3(planted.x, planted.y, -vertexIndex * spacing);

    vec3 bristlePosition = u_brushPosition + brushSpaceBristlePosition * u_brushScale;

    gl_FragColor = vec4(bristlePosition, 1.0);
}
