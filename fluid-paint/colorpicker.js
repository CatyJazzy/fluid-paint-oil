var ColorPicker = (function () {
    'use strict';

    // [atelier] 큰 사각형 + 세로 띠 두 개.
    //
    // 원본은 색상환 고리 안에 내접하는 정사각형이라 집을 수 있는 면적이 좁았다
    // (고리 지름 180 에 사각형 한 변 106). 같은 자리에서 사각형이 3배 넓어진다.
    //
    // 좌표는 모두 [left, bottom] 기준이다.

    var WIDTH = 300;
    var HEIGHT = 200;

    var PAD = 10;
    var BAR_WIDTH = 20;
    var BAR_GAP = 14;

    var SQUARE_X = PAD;
    var SQUARE_Y = PAD;
    var SQUARE_WIDTH = 180;
    var SQUARE_HEIGHT = HEIGHT - PAD * 2;

    var HUE_SLIDER_X = SQUARE_X + SQUARE_WIDTH + BAR_GAP;
    var ALPHA_SLIDER_X = HUE_SLIDER_X + BAR_WIDTH + BAR_GAP;
    var SLIDER_Y = PAD;
    var SLIDER_HEIGHT = HEIGHT - PAD * 2;

    //edits a HSVA array
    function ColorPicker (painter, parameterName, wgl, canvas, shaderSources, left, bottom) {
        this.wgl = wgl;
        this.canvas = canvas;

        //painter[parameterName] points to the HSVA array this picker edits
        this.painter = painter;
        this.parameterName = parameterName;

        this.left = left;
        this.bottom = bottom;

        //whether we're currently manipulating the hue or the saturation/lightness
        this.huePressed = false;
        this.saturationLightnessPressed = false;
        this.alphaPressed = false;

        this.pickerProgram = wgl.createProgram(
            shaderSources['shaders/picker.vert'], shaderSources['shaders/picker.frag'], { 'a_position': 0 });

        this.pickerProgramRGB = wgl.createProgram(
            shaderSources['shaders/picker.vert'], '#define RGB \n ' + shaderSources['shaders/picker.frag'], { 'a_position': 0 });

        this.quadVertexBuffer = wgl.createBuffer();
        wgl.bufferData(this.quadVertexBuffer, wgl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]), wgl.STATIC_DRAW);
    }

    /**
     * @param clip [atelier] {left, bottom, width, height} — 패널 밖으로 삐져나가지
     *   않게 자른다. 패널이 스크롤되면서 색상환이 패널 경계를 넘을 수 있다.
     */
    ColorPicker.prototype.draw = function (rgbModel, clip) {
        var wgl = this.wgl;

        var hsva = this.painter[this.parameterName];

        var pickerDrawState = wgl.createDrawState()
            .bindFramebuffer(null)
            .viewport(0, 0, this.canvas.width, this.canvas.height)
            .vertexAttribPointer(this.quadVertexBuffer, 0, 2, wgl.FLOAT, wgl.FALSE, 0, 0)
            .useProgram(rgbModel ? this.pickerProgramRGB : this.pickerProgram)
            .uniform2f('u_resolution', WIDTH, HEIGHT)
            .uniform2f('u_squarePosition', SQUARE_X, SQUARE_Y)
            .uniform2f('u_squareDimensions', SQUARE_WIDTH, SQUARE_HEIGHT)
            .uniform2f('u_hueSliderPosition', HUE_SLIDER_X, SLIDER_Y)
            .uniform2f('u_hueSliderDimensions', BAR_WIDTH, SLIDER_HEIGHT)
            .uniform2f('u_alphaSliderPosition', ALPHA_SLIDER_X, SLIDER_Y)
            .uniform2f('u_alphaSliderDimensions', BAR_WIDTH, SLIDER_HEIGHT)
            .uniform4f('u_currentHSVA', hsva[0], hsva[1], hsva[2], hsva[3])
            .uniform2f('u_screenResolution', this.canvas.width, this.canvas.height)
            .uniform2f('u_position', this.left, this.bottom)
            .uniform2f('u_dimensions', WIDTH, HEIGHT)
            .enable(wgl.BLEND)
            .blendFunc(wgl.ONE, wgl.ONE_MINUS_SRC_ALPHA); //premultiplied alpha

        if (clip) {
            pickerDrawState
                .enable(wgl.SCISSOR_TEST)
                .scissor(clip.left, clip.bottom, clip.width, clip.height);
        }

        wgl.drawArrays(pickerDrawState, wgl.TRIANGLE_STRIP, 0, 4);
    };

    ColorPicker.prototype.overControl = function (x, y) {
        if (this.clip && (y < this.clip.bottom || y > this.clip.bottom + this.clip.height)) return false;
        return this.overHue(x, y) || this.overSaturationLightness(x, y) || this.overAlpha(x, y);
    };

    /**
     * 손가락·커서가 살짝 빗나가도 잡히게 조금 넓게 본다.
     *
     * 위아래로도 넓혀야 한다. 정확히 경계 픽셀을 찍으면 반올림 때문에 빗나가서
     * 띠의 맨 끝(색상 0, 불투명도 1)에 손이 닿지 않는다. 값은 어차피 clamp 한다.
     */
    function inBox (x, y, left, bottom, width, height, slack) {
        slack = slack || 0;
        return x >= left - slack && x <= left + width + slack
            && y >= bottom - 3 && y <= bottom + height + 3;
    }

    ColorPicker.prototype.overHue = function (x, y) { //x and y are relative to the canvas
        return inBox(x - this.left, y - this.bottom, HUE_SLIDER_X, SLIDER_Y, BAR_WIDTH, SLIDER_HEIGHT, 4);
    };

    ColorPicker.prototype.overSaturationLightness = function (x, y) {
        return inBox(x - this.left, y - this.bottom, SQUARE_X, SQUARE_Y, SQUARE_WIDTH, SQUARE_HEIGHT);
    };

    ColorPicker.prototype.overAlpha = function (x, y) {
        return inBox(x - this.left, y - this.bottom, ALPHA_SLIDER_X, SLIDER_Y, BAR_WIDTH, SLIDER_HEIGHT, 4);
    };

    ColorPicker.prototype.onMouseDown = function (x, y) { //x and y are relative to the canvas
        if (this.overHue(x, y)) { 
            this.huePressed = true;
        } else if (this.overSaturationLightness(x, y)) {
            this.saturationLightnessPressed = true;
        } else if (this.overAlpha(x, y)) {
            this.alphaPressed = true;
        }

        this.onMouseMove(x, y);
    };

    ColorPicker.prototype.isInUse = function () {
        return this.huePressed || this.saturationLightnessPressed || this.alphaPressed;
    };

    ColorPicker.prototype.onMouseUp = function (x, y) {
        this.huePressed = false;
        this.saturationLightnessPressed = false;
        this.alphaPressed = false;
    };

    ColorPicker.prototype.onMouseMove = function (mouseX, mouseY) {
        //make relative to the picker
        mouseX -= this.left;
        mouseY -= this.bottom;

        if (this.huePressed || this.saturationLightnessPressed || this.alphaPressed) {
            var hsva = this.painter[this.parameterName];

            if (this.huePressed) {
                // 띠는 위가 0 이다 (그림판류의 관행)
                hsva[0] = Utilities.clamp(1 - (mouseY - SLIDER_Y) / SLIDER_HEIGHT, 0, 1);
            } else if (this.saturationLightnessPressed) {
                hsva[1] = Utilities.clamp((mouseX - SQUARE_X) / SQUARE_WIDTH, 0, 1);   //채도
                hsva[2] = Utilities.clamp((mouseY - SQUARE_Y) / SQUARE_HEIGHT, 0, 1);  //명도
            } else if (this.alphaPressed) {
                hsva[3] = Utilities.clamp((mouseY - SLIDER_Y) / SLIDER_HEIGHT, 0, 1);
            }
        }
    };

    return ColorPicker;

}());
