precision highp float;

uniform vec3 u_brushPosition;
uniform float u_brushScale;
uniform float u_bristleCount;

uniform float u_bristleLength; //length of total bristle
uniform float u_verticesPerBristle;

uniform sampler2D u_randomsTexture;
uniform vec2 u_resolution;

uniform float u_jitter;

// [atelier] 붓을 눕힌 각도. 0 이면 수직으로 세운 붓이다.
//
// 원본은 붓털이 언제나 캔버스에 **수직으로** 꽂혀 있었다. 붓털 길이가
// 4.5×scale 인데 붓 몸통은 2.0×scale 높이에 있어서, 붓털 길이의 절반 이상이
// 캔버스 아래로 박힌 채 평면 제약에 밀려 옆으로 눕는다. 그래서 어떤 획을
// 그어도 붓털 옆면이 빗처럼 통째로 드러났다.
//
// 실제로는 붓을 세워 쓰기도 하고, 그때는 붓 끝만 눌려 결이 약간 보일 뿐이다.
// 기울기를 값으로 두고 한 붓 안에서는 고정한다.
// [atelier] 붓털 밀도 분포.
//
// 원본은 sqrt(i/N) 이라 **면적당 밀도가 균일**하다. 수학적으로 고른 분포지만
// 실제 붓은 가운데가 빽빽하고 가장자리로 갈수록 성기다. 지수를 올리면
// 가운데로 몰린다 (0.5 = 원본, 0.8 = 가운데가 빽빽).
uniform float u_density;

// [atelier] 붓털이 얼마나 모여 있는가. 1 이면 원본(붓 반지름 전체에 퍼짐).
// 실제 붓은 털이 뭉쳐 있어서 자국이 하나의 막으로 합쳐진다.
uniform float u_gather;

uniform float u_tilt;          // 라디안. 수직에서 얼마나 눕혔는지
uniform float u_tiltDirection; // 어느 쪽으로 눕혔는지

const float PHI = 1.618033988749895;
const float PI = 3.14159265;

void main () {
    vec2 coordinates = gl_FragCoord.xy / u_resolution;

    vec4 randoms = texture2D(u_randomsTexture, coordinates);

    float bristleIndex = floor(gl_FragCoord.x); //which bristle
    float vertexIndex = floor(gl_FragCoord.y);

    //jittered sunflower distribution

    float theta = (bristleIndex + (randoms.z - 0.5) * u_jitter) * 2.0 * PI / (PHI * PHI);
    // 0번 붓털은 jitter 때문에 음수의 제곱근이 되어 NaN 이 된다 (원본 그대로).
    // 붓털 하나라 눈에 안 띄지만 막아 둔다.
    float rr = max(bristleIndex + (randoms.w - 0.5) * u_jitter, 0.0);
    float r = pow(rr / u_bristleCount, u_density) * u_gather;

    float spacing = u_bristleLength / (u_verticesPerBristle - 1.0);

    // 붓털이 뻗는 방향. 기울기가 0 이면 똑바로 아래(-z)다.
    float st = sin(u_tilt), ct = cos(u_tilt);
    float cd = cos(u_tiltDirection), sd = sin(u_tiltDirection);

    vec3 down = vec3(st * cd, st * sd, -ct);

    // 다발의 단면도 같이 기울어야 한다. 안 그러면 기울일수록 단면이
    // 캔버스에 눌려 납작해지는 게 아니라 그냥 비뚤어진 원이 된다.
    //
    // 좌표계는 각도에서 바로 세운다. cross 로 구하면 기울기 0 일 때 영벡터가
    // 나와 normalize 가 NaN 이 되고, 붓털 좌표가 통째로 날아간다.
    vec3 across = vec3(-sd, cd, 0.0);        //기운 방향과 수직인 수평축
    vec3 along = cross(down, across);

    vec2 disc = vec2(r * cos(theta), r * sin(theta));
    vec3 brushSpaceBristlePosition = across * disc.x + along * disc.y + down * (vertexIndex * spacing);

    vec3 bristlePosition = u_brushPosition + brushSpaceBristlePosition * u_brushScale;

    gl_FragColor = vec4(bristlePosition, 1.0);
}
