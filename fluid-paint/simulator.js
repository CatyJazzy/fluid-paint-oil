var Simulator = (function () {
    'use strict';

    var PRESSURE_JACOBI_ITERATIONS = 2;

    var FRAMES_TO_SIMULATE = 60; //how many frames to simulate the area induced by each splat for

    var SPLAT_PADDING = 4.5; //approximately sqrt(BRISTLE_LENGTH * BRISTLE_LENGTH - BRUSH_HEIGHT * BRUSH_HEIGHT)
    var SPEED_PADDING = 1.1;

    // [atelier] 붓이 폭을 따라 물고 있는 색의 칸 수.
    // libmypaint 의 smudge_bucket 은 256 칸이지만 그건 획 사이에 색을 나눠 담는
    // 용도고, 우리는 **한 붓 안에서 폭 방향**으로 쓰므로 붓털 다발 수 정도면 된다.
    var SMUDGE_CELLS = 8;


    function SplatArea (rectangle, frameNumber) {
        this.rectangle = rectangle;
        this.frameNumber = frameNumber;
    }

    function Simulator (wgl, shaderSources, resolutionWidth, resolutionHeight) {
        this.wgl = wgl;

        wgl.getExtension('OES_texture_float');
        wgl.getExtension('OES_texture_float_linear');



        var halfFloatExt = wgl.getExtension('OES_texture_half_float');
        var halfFloatLinearExt = wgl.getExtension('OES_texture_half_float_linear');


        this.simulationTextureType = wgl.hasHalfFloatTextureSupport() ? halfFloatExt.HALF_FLOAT_OES : wgl.FLOAT; //use float if half float not available


        this.resolutionWidth = resolutionWidth;
        this.resolutionHeight = resolutionHeight;

        this.fluidity = 0.8;

        this.frameNumber = 0;

       

        this.splatAreas = []; //the splat areas that we're currently still simulating
        //more recent are at the front of the array



        //////////////////////////////////////////////////
        // create shader programs

        this.splatProgram = wgl.createProgram(
            shaderSources['shaders/splat.vert'], shaderSources['shaders/splat.frag']);

        this.velocitySplatProgram = wgl.createProgram(
            '#define VELOCITY \n' + shaderSources['shaders/splat.vert'], '#define VELOCITY \n' + shaderSources['shaders/splat.frag']);

        // [atelier] 고정 붓. 붓털 위치 텍스처 대신 dab 하나의 사각형을 찍는다.
        this.dabSplatProgram = wgl.createProgram(
            shaderSources['shaders/dab.vert'], shaderSources['shaders/dab.frag']);

        this.dabVelocitySplatProgram = wgl.createProgram(
            '#define VELOCITY \n' + shaderSources['shaders/dab.vert'],
            '#define VELOCITY \n' + shaderSources['shaders/dab.frag']);

        // [atelier] 두께만 쌓는 패스. 색 농도와 두께를 떼어 놓기 위한 것이다.
        this.dabHeightProgram = wgl.createProgram(
            '#define HEIGHT \n' + shaderSources['shaders/dab.vert'],
            '#define HEIGHT \n' + shaderSources['shaders/dab.frag']);

        this.advectProgram = wgl.createProgram(
            shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/advect.frag']);

        this.divergenceProgram = wgl.createProgram(
            shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/divergence.frag']);

        this.jacobiProgram = wgl.createProgram(
            shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/jacobi.frag']);

        this.subtractProgram = wgl.createProgram(
            shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/subtract.frag']);

        this.copyProgram = wgl.createProgram(
            shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/output.frag']);

        this.resizeProgram = wgl.createProgram(
            shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/resize.frag']);

        // [atelier] 붓이 물고 있는 색을 갱신하는 패스
        this.smudgeProgram = wgl.createProgram(
            shaderSources['shaders/fullscreen.vert'], shaderSources['shaders/smudge.frag']);

        
        ///////////////////////////////////////////////
        // create buffers

        this.quadVertexBuffer = wgl.createBuffer();
        wgl.bufferData(this.quadVertexBuffer, wgl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]), wgl.STATIC_DRAW);

        this.splatPositionsBuffer = wgl.createBuffer();
        this.splatVelocitiesBuffer = wgl.createBuffer();

        // [atelier] dab 을 펼친 삼각형들. 매 프레임 다시 채운다.
        this.dabVertexBuffer = wgl.createBuffer();
        this.dabVertexData = new Float32Array(0);



        this.simulationFramebuffer = wgl.createFramebuffer();


        //create textures

        this.paintTexture = wgl.buildTexture(wgl.RGBA, wgl.FLOAT, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        this.paintTextureTemp = wgl.buildTexture(wgl.RGBA, wgl.FLOAT, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

        this.velocityTexture = wgl.buildTexture(wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        this.velocityTextureTemp = wgl.buildTexture(wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

        this.divergenceTexture = wgl.buildTexture(wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);
        this.pressureTexture = wgl.buildTexture(wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

        
        this.pressureTextureTemp = wgl.buildTexture(wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

        // [atelier] 붓이 물고 있는 색. rgb 는 집어 온 색(RYB), a 는 얼마나 물고 있는지.
        //
        // **붓 폭을 따라 여러 칸**을 둔다. 한 칸만 두면 붓 전체가 색 하나만 물어서
        // 섞인 자리가 고르게 한 가지 색이 된다. 실제 유화는 붓의 이쪽과 저쪽이
        // 다른 색을 물고 있어 얼룩덜룩하게 섞인다. 붓털을 한 가닥씩
        // 시뮬레이션하지 않고 그 상태를 내는 것이 libmypaint 의 smudge_bucket 이다.
        //
        // 자기 자신을 읽으면서 쓰므로 두 장을 번갈아 쓴다.
        this.smudgeCells = SMUDGE_CELLS;
        this.smudgeTexture = wgl.buildTexture(wgl.RGBA, wgl.FLOAT, SMUDGE_CELLS, 1, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        this.smudgeTextureTemp = wgl.buildTexture(wgl.RGBA, wgl.FLOAT, SMUDGE_CELLS, 1, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

        this.clearTextures([this.paintTexture, this.paintTextureTemp, this.velocityTexture, this.velocityTextureTemp, this.divergenceTexture, this.pressureTexture, this.pressureTextureTemp, this.smudgeTexture, this.smudgeTextureTemp]);
    }

    // [atelier] 붓을 닦는다. 획을 시작할 때 부른다.
    Simulator.prototype.clearSmudge = function () {
        this.clearTextures([this.smudgeTexture, this.smudgeTextureTemp]);
    };

    /**
     * [atelier] 붓이 물고 있는 색을 갱신한다.
     *
     * 물감 텍스처를 렌더 타깃으로 쓰는 중에는 같이 읽을 수 없으므로,
     * 찍기 **전에** 별도 패스로 붓 아래 색을 한 픽셀에 적어 둔다.
     * CPU 로 readPixels 하지 않는다 — 매 프레임 파이프라인이 멈춘다.
     *
     * @param x,y            붓 위치 (캔버스 좌표)
     * @param radius         집어 오는 반지름 (캔버스 좌표)
     * @param smudgeLength   0 이면 즉시 캔버스 색, 1 에 가까우면 천천히 물든다
     */
    Simulator.prototype.updateSmudge = function (x, y, radius, paintingRectangle, smudgeLength, acrossX, acrossY) {
        var wgl = this.wgl;

        var u = (x - paintingRectangle.left) / paintingRectangle.width;
        var v = (y - paintingRectangle.bottom) / paintingRectangle.height;

        // 붓 폭 방향 반 길이를 uv 로. 칸마다 이 방향으로 어긋난 자리를 본다.
        var acrossU = (acrossX || 0) * radius / paintingRectangle.width;
        var acrossV = (acrossY || 0) * radius / paintingRectangle.height;

        // 칸 하나가 맡는 폭만큼만 훑는다. 칸끼리 같은 자리를 보면 색이 안 갈린다.
        var cellRadius = radius / this.smudgeCells * 1.4;

        var drawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.smudgeCells, 1)
            .useProgram(this.smudgeProgram)
            .uniformTexture('u_paintTexture', 0, wgl.TEXTURE_2D, this.paintTexture)
            .uniformTexture('u_previousSmudge', 1, wgl.TEXTURE_2D, this.smudgeTexture)
            .uniform2f('u_brushPosition', u, v)
            .uniform2f('u_radius', cellRadius / paintingRectangle.width, cellRadius / paintingRectangle.height)
            .uniform1f('u_smudgeLength', smudgeLength)
            .uniform2f('u_across', acrossU, acrossV)
            .uniform1f('u_cells', this.smudgeCells)
            .vertexAttribPointer(this.quadVertexBuffer, this.smudgeProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0);

        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.smudgeTextureTemp, 0);
        wgl.drawArrays(drawState, wgl.TRIANGLE_STRIP, 0, 4);

        Utilities.swap(this, 'smudgeTexture', 'smudgeTextureTemp');
    };

    Simulator.prototype.clearTextures = function (textures) {
        var wgl = this.wgl;

        for (var i = 0; i < textures.length; ++i) {
            wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, textures[i], 0);

            wgl.clear(
                wgl.createClearState().bindFramebuffer(this.simulationFramebuffer),
                wgl.COLOR_BUFFER_BIT);
        }
    };

    Simulator.prototype.clear = function () {
        this.clearTextures([this.paintTexture, this.paintTextureTemp]);
    };

    Simulator.prototype.copyTexture = function (destinationWidth, destinationHeight, sourceTexture, destinationTexture) {
        var copyDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, destinationWidth, destinationHeight)
            .useProgram(this.copyProgram)

            .uniformTexture('u_input', 0, wgl.TEXTURE_2D, sourceTexture)

            .vertexAttribPointer(this.quadVertexBuffer, this.copyProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0);

        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, destinationTexture, 0);
        wgl.drawArrays(copyDrawState, wgl.TRIANGLE_STRIP, 0, 4);
    };

    //resizes the canvas with direct texel correspondence, offsetting the previous painting
    Simulator.prototype.resize = function (newWidth, newHeight, offsetX, offsetY, featherSize) {
        var wgl = this.wgl;


        var resizeDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, newWidth, newHeight)
            .useProgram(this.resizeProgram)

            .uniformTexture('u_paintTexture', 0, wgl.TEXTURE_2D, this.paintTexture)
            .uniform2f('u_oldResolution', this.resolutionWidth, this.resolutionHeight)
            .uniform2f('u_offset', offsetX, offsetY)
            .uniform1f('u_featherSize', featherSize)

            .vertexAttribPointer(this.quadVertexBuffer, this.resizeProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0);


        wgl.rebuildTexture(this.paintTextureTemp, wgl.RGBA, wgl.FLOAT, newWidth, newHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.paintTextureTemp, 0);
        wgl.drawArrays(resizeDrawState, wgl.TRIANGLE_STRIP, 0, 4);

        Utilities.swap(this, 'paintTexture', 'paintTextureTemp');




        this.resolutionWidth = newWidth;
        this.resolutionHeight = newHeight;


        wgl.rebuildTexture(this.paintTextureTemp, wgl.RGBA, wgl.FLOAT, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        this.copyTexture(newWidth, newHeight, this.paintTexture, this.paintTextureTemp);


        wgl.rebuildTexture(this.velocityTexture, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        wgl.rebuildTexture(this.velocityTextureTemp, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

        wgl.rebuildTexture(this.divergenceTexture, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

        wgl.rebuildTexture(this.pressureTexture, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);
        wgl.rebuildTexture(this.pressureTextureTemp, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);
        
        
        this.clearTextures([this.velocityTexture, this.velocityTextureTemp, this.divergenceTexture, this.pressureTexture, this.pressureTextureTemp]);
    };

    //resamples the whole painting
    Simulator.prototype.changeResolution = function (newWidth, newHeight) {
        var wgl = this.wgl;


        wgl.rebuildTexture(this.paintTextureTemp, wgl.RGBA, wgl.FLOAT, newWidth, newHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        this.copyTexture(newWidth, newHeight, this.paintTexture, this.paintTextureTemp);
        Utilities.swap(this, 'paintTexture', 'paintTextureTemp');

        this.resolutionWidth = newWidth;
        this.resolutionHeight = newHeight;


        wgl.rebuildTexture(this.paintTextureTemp, wgl.RGBA, wgl.FLOAT, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        this.copyTexture(newWidth, newHeight, this.paintTexture, this.paintTextureTemp);


        wgl.rebuildTexture(this.velocityTexture, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);
        wgl.rebuildTexture(this.velocityTextureTemp, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.LINEAR, wgl.LINEAR);

        wgl.rebuildTexture(this.divergenceTexture, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);

        wgl.rebuildTexture(this.pressureTexture, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);
        wgl.rebuildTexture(this.pressureTextureTemp, wgl.RGBA, this.simulationTextureType, this.resolutionWidth, this.resolutionHeight, null, wgl.CLAMP_TO_EDGE, wgl.CLAMP_TO_EDGE, wgl.NEAREST, wgl.NEAREST);


        this.clearTextures([this.velocityTexture, this.velocityTextureTemp, this.divergenceTexture, this.pressureTexture, this.pressureTextureTemp]);
    };


    //assumes destination texture has dimensions resolutionWidth x resolutionHeight
    Simulator.prototype.copyPaintTexture = function (destinationTexture) {
        this.copyTexture(this.resolutionWidth, this.resolutionHeight, this.paintTexture, destinationTexture);
    };

    Simulator.prototype.applyPaintTexture = function (texture) {
        this.copyTexture(this.resolutionWidth, this.resolutionHeight, texture, this.paintTexture);
        this.copyTexture(this.resolutionWidth, this.resolutionHeight, texture, this.paintTextureTemp);

        this.clearTextures([this.velocityTexture, this.velocityTextureTemp]);
    };

    //returns the area we're currently simulating
    Simulator.prototype.getSimulationArea = function () {
        var simulationBorder = 0;

        //now let's work out the total simulation area we need to simulate
        var simulationArea = this.splatAreas[0].rectangle.clone(); //start with the first rectangle

        for (var i = 1; i < this.splatAreas.length; ++i) { //and add the others
            var splatArea = this.splatAreas[i];
            var area = splatArea.rectangle.clone();

            simulationArea.includeRectangle(area);
        }

        simulationArea.round();
        simulationArea.intersectRectangle(new Rectangle(0, 0, this.resolutionWidth, this.resolutionHeight));

        return simulationArea;
    };

    Simulator.prototype.splat = function (brush, zThreshold, paintingRectangle, splatColor, splatRadius, velocityScale) {

        //the area we need to simulate for this set of splats
        var brushPadding = Math.ceil(brush.scale * SPLAT_PADDING);
        brushPadding += Math.ceil(brush.getFilteredSpeed() * SPEED_PADDING);

        //we start in canvas space
        var area = new Rectangle(brush.positionX - brushPadding, brush.positionY - brushPadding, brushPadding * 2, brushPadding * 2);
        
        //transform into simulation space
        area.translate(-paintingRectangle.left, -paintingRectangle.bottom);
        area.scale(this.resolutionWidth / paintingRectangle.width, this.resolutionHeight / paintingRectangle.height);
        area.round();
        area.intersectRectangle(new Rectangle(0, 0, this.resolutionWidth, this.resolutionHeight));

        this.splatAreas.splice(0, 0, new SplatArea(area, this.frameNumber));

        var simulationArea = this.getSimulationArea();


        var wgl = this.wgl;


        /*
        var clearState = wgl.createClearState()
            .bindFramebuffer(this.simulationFramebuffer)
            .clearColor(Math.sin(this.frameNumber * 0.1) * 0.5 + 0.5, 1, 1, 1)
            
            //restrict splatting to area that'll be simulated
            .enable(wgl.SCISSOR_TEST)
            .scissor(Math.floor(simulationArea.left), Math.floor(simulationArea.bottom), Math.floor(simulationArea.width), Math.floor(simulationArea.height))


        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.paintTexture, 0);
        wgl.clear(clearState, wgl.COLOR_BUFFER_BIT);
        */


        var splatPaintDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.resolutionWidth, this.resolutionHeight)
            
            //restrict splatting to area that'll be simulated
            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .enable(wgl.BLEND)
            .blendEquation(wgl.FUNC_ADD)
            .blendFuncSeparate(wgl.SRC_ALPHA, wgl.ONE_MINUS_SRC_ALPHA, wgl.ONE, wgl.ONE)

            .vertexAttribPointer(brush.splatCoordinatesBuffer, this.splatProgram.getAttribLocation('a_splatCoordinates'), 4, wgl.FLOAT, wgl.FALSE, 0, 0)
            .bindIndexBuffer(brush.splatIndexBuffer)

            .useProgram(this.splatProgram)

            .uniform2f('u_paintingDimensions', paintingRectangle.width, paintingRectangle.height)
            .uniform2f('u_paintingPosition', paintingRectangle.left, paintingRectangle.bottom)
            .uniform1f('u_splatRadius', splatRadius)
            .uniform4f('u_splatColor', splatColor[0], splatColor[1], splatColor[2], splatColor[3])
            .uniformTexture('u_positionsTexture', 0, wgl.TEXTURE_2D, brush.positionsTexture)
            .uniformTexture('u_previousPositionsTexture', 1, wgl.TEXTURE_2D, brush.previousPositionsTexture)
            .uniform1f('u_zThreshold', zThreshold);

        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.paintTexture, 0);
        wgl.drawElements(splatPaintDrawState, wgl.TRIANGLES, brush.splatIndexCount * brush.bristleCount / brush.maxBristleCount, wgl.UNSIGNED_SHORT, 0);



        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.velocityTexture, 0);

        var splatVelocityDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.resolutionWidth, this.resolutionHeight)

            //restrict splatting to area that'll be simulated
            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .enable(wgl.BLEND)
            .blendEquation(wgl.FUNC_ADD)
            .blendFuncSeparate(wgl.ONE, wgl.ONE, wgl.ZERO, wgl.ZERO)

            .vertexAttribPointer(brush.splatCoordinatesBuffer, this.splatProgram.getAttribLocation('a_splatCoordinates'), 4, wgl.FLOAT, wgl.FALSE, 0, 0)
            .bindIndexBuffer(brush.splatIndexBuffer)
            .useProgram(this.velocitySplatProgram)

            .uniform2f('u_paintingDimensions', paintingRectangle.width, paintingRectangle.height)
            .uniform2f('u_paintingPosition', paintingRectangle.left, paintingRectangle.bottom)
            .uniform1f('u_splatRadius', splatRadius)
            .uniformTexture('u_positionsTexture', 0, wgl.TEXTURE_2D, brush.positionsTexture)
            .uniformTexture('u_previousPositionsTexture', 1, wgl.TEXTURE_2D, brush.previousPositionsTexture)
            .uniformTexture('u_velocitiesTexture', 2, wgl.TEXTURE_2D, brush.velocitiesTexture)
            .uniformTexture('u_previousVelocitiesTexture', 3, wgl.TEXTURE_2D, brush.previousVelocitiesTexture)
            .uniform1f('u_zThreshold', zThreshold)
            .uniform1f('u_velocityScale', velocityScale);

        wgl.drawElements(splatVelocityDrawState, wgl.TRIANGLES, brush.splatIndexCount * brush.bristleCount / brush.maxBristleCount, wgl.UNSIGNED_SHORT, 0);

    };


    // [atelier] 고정 붓으로 dab 목록을 찍는다.
    //
    // dabs: [{ x, y, radius, aspect, angle, alpha, vx, vy }, ...]
    // 붓 모양은 tipTexture 한 장이 정한다. 붓털도, 위치 텍스처도 쓰지 않는다.
    Simulator.prototype.splatDabs = function (dabs, paintingRectangle, splatColor, tipTexture, velocityScale, grain, smudge, thickness, relief) {
        if (dabs.length === 0) return;

        var wgl = this.wgl;

        // 시뮬레이션할 범위 — 이번에 찍은 dab 들을 감싸는 사각형
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < dabs.length; ++i) {
            var d = dabs[i];
            var reach = d.radius + SPLAT_PADDING;
            minX = Math.min(minX, d.x - reach);
            minY = Math.min(minY, d.y - reach);
            maxX = Math.max(maxX, d.x + reach);
            maxY = Math.max(maxY, d.y + reach);
        }

        var area = new Rectangle(minX, minY, maxX - minX, maxY - minY);
        area.translate(-paintingRectangle.left, -paintingRectangle.bottom);
        area.scale(this.resolutionWidth / paintingRectangle.width, this.resolutionHeight / paintingRectangle.height);
        area.round();
        area.intersectRectangle(new Rectangle(0, 0, this.resolutionWidth, this.resolutionHeight));

        this.splatAreas.splice(0, 0, new SplatArea(area, this.frameNumber));

        var simulationArea = this.getSimulationArea();

        // 사각형 하나에 삼각형 둘, 꼭짓점 여섯. 꼭짓점마다 10 float.
        var FLOATS_PER_VERTEX = 12;
        var VERTICES_PER_DAB = 6;
        var needed = dabs.length * VERTICES_PER_DAB * FLOATS_PER_VERTEX;
        if (this.dabVertexData.length < needed) {
            this.dabVertexData = new Float32Array(needed * 2);
        }

        var data = this.dabVertexData;
        var corners = [[-1, -1], [1, -1], [-1, 1], [1, -1], [1, 1], [-1, 1]];
        var offset = 0;
        for (var j = 0; j < dabs.length; ++j) {
            var dab = dabs[j];
            for (var c = 0; c < VERTICES_PER_DAB; ++c) {
                data[offset] = corners[c][0];
                data[offset + 1] = corners[c][1];
                data[offset + 2] = dab.x;
                data[offset + 3] = dab.y;
                data[offset + 4] = dab.radius;
                data[offset + 5] = Math.max(1.0, dab.aspect);
                data[offset + 6] = dab.angle;
                data[offset + 7] = dab.alpha;
                data[offset + 8] = dab.vx;
                data[offset + 9] = dab.vy;
                // 아틀라스 2×2 에서 이 dab 이 쓸 칸
                data[offset + 10] = (dab.variant % 2) * 0.5;
                data[offset + 11] = Math.floor(dab.variant / 2) * 0.5;
                offset += FLOATS_PER_VERTEX;
            }
        }

        wgl.bufferData(this.dabVertexBuffer, wgl.ARRAY_BUFFER, data.subarray(0, needed), wgl.STREAM_DRAW);

        var stride = FLOATS_PER_VERTEX * 4;
        var vertexCount = dabs.length * VERTICES_PER_DAB;

        function bindAttributes (drawState, program) {
            return drawState
                .vertexAttribPointer(this.dabVertexBuffer, program.getAttribLocation('a_corner'), 2, wgl.FLOAT, wgl.FALSE, stride, 0)
                .vertexAttribPointer(this.dabVertexBuffer, program.getAttribLocation('a_dab'), 4, wgl.FLOAT, wgl.FALSE, stride, 8)
                .vertexAttribPointer(this.dabVertexBuffer, program.getAttribLocation('a_extra'), 4, wgl.FLOAT, wgl.FALSE, stride, 24)
                .vertexAttribPointer(this.dabVertexBuffer, program.getAttribLocation('a_tip'), 2, wgl.FLOAT, wgl.FALSE, stride, 40);
        }

        // 물감 색 — 덮는 비율만 쓰고 두께는 손대지 않는다 (ZERO, ONE).
        // 두께는 바로 아래 전용 패스가 쌓는다.
        var paintDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.resolutionWidth, this.resolutionHeight)
            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)
            .enable(wgl.BLEND)
            .blendEquation(wgl.FUNC_ADD)
            .blendFuncSeparate(wgl.SRC_ALPHA, wgl.ONE_MINUS_SRC_ALPHA, wgl.ZERO, wgl.ONE)
            .useProgram(this.dabSplatProgram)
            .uniform2f('u_paintingDimensions', paintingRectangle.width, paintingRectangle.height)
            .uniform2f('u_paintingPosition', paintingRectangle.left, paintingRectangle.bottom)
            .uniform4f('u_splatColor', splatColor[0], splatColor[1], splatColor[2], splatColor[3])
            .uniformTexture('u_tipTexture', 0, wgl.TEXTURE_2D, tipTexture)
            .uniformTexture('u_grainTexture', 1, wgl.TEXTURE_2D, grain.texture)
            .uniform1f('u_grainScale', grain.scale)
            .uniform1f('u_grainStrength', grain.strength)
            .uniform1f('u_grainFadeAt', grain.fadeAt)
            .uniformTexture('u_smudgeTexture', 2, wgl.TEXTURE_2D, this.smudgeTexture)
            .uniform1f('u_smudge', smudge);

        bindAttributes.call(this, paintDrawState, this.dabSplatProgram);

        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.paintTexture, 0);
        wgl.drawArrays(paintDrawState, wgl.TRIANGLES, 0, vertexCount);

        // 두께 — a 채널에만 더한다.
        //
        // 색을 덮는 비율과 두께를 한 값으로 묶으면, 임파스토를 내려고 값을 올릴 때
        // dab 하나가 색을 통째로 덮어 버린다. 원본이 붓털 100 가닥으로 얻던
        // "색은 부드럽게, 두께는 크게"를 고정 붓에서 내려면 패스를 나눠야 한다.
        var heightDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.resolutionWidth, this.resolutionHeight)
            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)
            .colorMask(false, false, false, true)
            .enable(wgl.BLEND)
            .blendEquation(wgl.FUNC_ADD)
            .blendFunc(wgl.ONE, wgl.ONE)
            .useProgram(this.dabHeightProgram)
            .uniform2f('u_paintingDimensions', paintingRectangle.width, paintingRectangle.height)
            .uniform2f('u_paintingPosition', paintingRectangle.left, paintingRectangle.bottom)
            .uniform1f('u_thickness', thickness)
            .uniform1f('u_edgeWidth', relief.edgeWidth)
            .uniform1f('u_streak', relief.streak)
            .uniformTexture('u_tipTexture', 0, wgl.TEXTURE_2D, tipTexture)
            .uniformTexture('u_grainTexture', 1, wgl.TEXTURE_2D, grain.texture)
            .uniform1f('u_grainScale', grain.scale)
            .uniform1f('u_grainStrength', grain.strength)
            .uniform1f('u_grainFadeAt', grain.fadeAt);

        bindAttributes.call(this, heightDrawState, this.dabHeightProgram);
        wgl.drawArrays(heightDrawState, wgl.TRIANGLES, 0, vertexCount);

        // 속도 — 유체를 밀어 물감이 끌리게 한다
        var velocityDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(0, 0, this.resolutionWidth, this.resolutionHeight)
            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)
            .enable(wgl.BLEND)
            .blendEquation(wgl.FUNC_ADD)
            .blendFuncSeparate(wgl.ONE, wgl.ONE, wgl.ZERO, wgl.ZERO)
            .useProgram(this.dabVelocitySplatProgram)
            .uniform2f('u_paintingDimensions', paintingRectangle.width, paintingRectangle.height)
            .uniform2f('u_paintingPosition', paintingRectangle.left, paintingRectangle.bottom)
            .uniform1f('u_velocityScale', velocityScale)
            .uniformTexture('u_tipTexture', 0, wgl.TEXTURE_2D, tipTexture)
            .uniformTexture('u_grainTexture', 1, wgl.TEXTURE_2D, grain.texture)
            .uniform1f('u_grainScale', grain.scale)
            .uniform1f('u_grainStrength', grain.strength)
            .uniform1f('u_grainFadeAt', grain.fadeAt);

        bindAttributes.call(this, velocityDrawState, this.dabVelocitySplatProgram);

        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.velocityTexture, 0);
        wgl.drawArrays(velocityDrawState, wgl.TRIANGLES, 0, vertexCount);
    };


    //returns whether any simulating actually took place
    Simulator.prototype.simulate = function () {
        var wgl = this.wgl;


        if (this.splatAreas.length === 0) return false;

        var simulationArea = this.getSimulationArea();

        var advect = (function (velocityTexture, dataTexture, targetTexture, deltaTime, dissipation) {
            var advectDrawState = wgl.createDrawState()
                .bindFramebuffer(this.simulationFramebuffer)
                .viewport(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

                .enable(wgl.SCISSOR_TEST)
                .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)
                
                .useProgram(this.advectProgram)
                .uniform1f('u_dissipation', dissipation)
                .uniform2f('u_resolution', this.resolutionWidth, this.resolutionHeight)
                .uniformTexture('u_velocityTexture', 0, wgl.TEXTURE_2D, velocityTexture)
                .uniformTexture('u_inputTexture', 1, wgl.TEXTURE_2D, dataTexture)

                .uniform2f('u_min', simulationArea.left, simulationArea.bottom)
                .uniform2f('u_max', simulationArea.getRight(), simulationArea.getTop())

                .vertexAttribPointer(this.quadVertexBuffer, this.advectProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0);


            
            wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, targetTexture, 0);
            advectDrawState.uniform1f('u_deltaTime', deltaTime);

            wgl.drawArrays(advectDrawState, wgl.TRIANGLE_STRIP, 0, 4);


        }).bind(this);


        ////////////////////////////////////////
        // advect velocity and paint

        var DELTA_TIME = 1.0 / 60.0; //we use a constant timestep for simulation consistency


         //compute divergence for pressure projection

        var divergenceDrawState = wgl.createDrawState()
            
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .useProgram(this.divergenceProgram)
            .uniform2f('u_resolution', this.resolutionWidth, this.resolutionHeight)
            .uniformTexture('u_velocityTexture', 0, wgl.TEXTURE_2D, this.velocityTexture)

            .vertexAttribPointer(this.quadVertexBuffer, this.divergenceProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0);


        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.divergenceTexture, 0);
        
        wgl.drawArrays(divergenceDrawState, wgl.TRIANGLE_STRIP, 0, 4);
        
        
        //compute pressure via jacobi iteration

        var jacobiDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .useProgram(this.jacobiProgram)
            .uniform2f('u_resolution', this.resolutionWidth, this.resolutionHeight)
            .uniformTexture('u_divergenceTexture', 1, wgl.TEXTURE_2D, this.divergenceTexture)

            .vertexAttribPointer(this.quadVertexBuffer, this.jacobiProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0);


        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.pressureTexture, 0);
            wgl.clear(
                wgl.createClearState().bindFramebuffer(this.simulationFramebuffer),
                wgl.COLOR_BUFFER_BIT);
        
        for (var i = 0; i < PRESSURE_JACOBI_ITERATIONS; ++i) {
            wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.pressureTextureTemp, 0);
            jacobiDrawState.uniformTexture('u_pressureTexture', 0, wgl.TEXTURE_2D, this.pressureTexture);
            
            wgl.drawArrays(jacobiDrawState, wgl.TRIANGLE_STRIP, 0, 4);
            
            Utilities.swap(this, 'pressureTexture', 'pressureTextureTemp');
        }
        
        
        //subtract pressure gradient from velocity

        var subtractDrawState = wgl.createDrawState()
            .bindFramebuffer(this.simulationFramebuffer)
            .viewport(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .enable(wgl.SCISSOR_TEST)
            .scissor(simulationArea.left, simulationArea.bottom, simulationArea.width, simulationArea.height)

            .useProgram(this.subtractProgram)
            .uniform2f('u_resolution', this.resolutionWidth, this.resolutionHeight)
            .uniformTexture('u_pressureTexture', 0, wgl.TEXTURE_2D, this.pressureTexture)
            .uniformTexture('u_velocityTexture', 1, wgl.TEXTURE_2D, this.velocityTexture)

            .vertexAttribPointer(this.quadVertexBuffer, this.subtractProgram.getAttribLocation('a_position'), 2, wgl.FLOAT, false, 0, 0);

        
        wgl.framebufferTexture2D(this.simulationFramebuffer, wgl.FRAMEBUFFER, wgl.COLOR_ATTACHMENT0, wgl.TEXTURE_2D, this.velocityTextureTemp, 0);
        
        wgl.drawArrays(subtractDrawState, wgl.TRIANGLE_STRIP, 0, 4);
        
        Utilities.swap(this, 'velocityTexture', 'velocityTextureTemp');



        //advect paint
        advect(this.velocityTexture, this.paintTexture, this.paintTextureTemp, DELTA_TIME, 1.0);
        Utilities.swap(this, 'paintTexture', 'paintTextureTemp');

        //advect velocity
        advect(this.velocityTexture, this.velocityTexture, this.velocityTextureTemp, DELTA_TIME, this.fluidity);
        Utilities.swap(this, 'velocityTexture', 'velocityTextureTemp');



        this.frameNumber += 1;

        //remove all of the splat areas we no longer need to simulate
        var i = this.splatAreas.length;
        while (i--) {
            if (this.frameNumber - this.splatAreas[i].frameNumber > FRAMES_TO_SIMULATE) {
                this.splatAreas.splice(i, 1);
            }
        }


        if (this.splatAreas.length === 0) { //if we finished simulating on this step
            this.clearTextures(this.velocityTexture, this.velocityTextureTemp); //clear all velocity textures
        }


        return true;
    };


    return Simulator;

}());
