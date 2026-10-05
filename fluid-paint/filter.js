// [atelier] 이 파일은 원본(dli/paint)에 없다.
//
// 1€ 필터. 손떨림은 줄이고 지연은 늘리지 않는 저역통과 필터다.
//
// 이동 평균을 쓰면 선이 손을 뒤따라오는 지연이 생긴다. 1€ 필터는 속도를 보고
// 차단 주파수를 바꾼다 — 느리게 움직일 때는 낮춰 떨림을 잡고, 빠를 때는 올려
// 지연을 줄인다.
//
//   fc = fcmin + beta × |속도|
//
// 원저자: Géry Casiez 외, https://gery.casiez.net/1euro/
// 구현을 복사하지 않고 식만 보고 새로 썼다.

var OneEuro = (function () {
    'use strict';

    /** 차단 주파수와 표본 간격에서 평활 계수를 구한다. */
    function alphaFor (cutoff, deltaTime) {
        var tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / deltaTime);
    }

    function LowPass () {
        this.value = 0;
        this.initialized = false;
    }

    LowPass.prototype.filter = function (value, alpha) {
        if (!this.initialized) {
            this.value = value;
            this.initialized = true;
        } else {
            this.value = alpha * value + (1 - alpha) * this.value;
        }
        return this.value;
    };

    LowPass.prototype.reset = function () {
        this.initialized = false;
    };

    /**
     * @param minCutoff 느릴 때의 차단 주파수. 낮출수록 떨림이 줄고 더 느려진다
     * @param beta      속도에 따라 차단을 올리는 정도. 높일수록 빠른 획의 지연이 준다
     * @param dCutoff   속도 자체를 거르는 차단 주파수
     */
    function Filter (minCutoff, beta, dCutoff) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff !== undefined ? dCutoff : 1.0;

        this.value = new LowPass();
        this.derivative = new LowPass();
        this.previousRaw = 0;
        this.hasPrevious = false;
    }

    Filter.prototype.reset = function () {
        this.value.reset();
        this.derivative.reset();
        this.hasPrevious = false;
    };

    Filter.prototype.filter = function (raw, deltaTime) {
        var dt = Math.max(1 / 1000, deltaTime);

        var speed = this.hasPrevious ? (raw - this.previousRaw) / dt : 0;
        this.previousRaw = raw;
        this.hasPrevious = true;

        var smoothedSpeed = this.derivative.filter(speed, alphaFor(this.dCutoff, dt));

        // 빠르게 움직일수록 차단을 올려 손을 바로 따라간다.
        var cutoff = this.minCutoff + this.beta * Math.abs(smoothedSpeed);
        return this.value.filter(raw, alphaFor(cutoff, dt));
    };

    /**
     * 2D 위치와 압력을 함께 거른다.
     *
     * 압력은 위치보다 훨씬 약하게 건다. 세게 걸면 펜을 뗄 때 압력이 늦게 떨어져
     * 획 끝이 뭉친다. (조사 문서 §3.2)
     */
    function Pen (options) {
        options = options || {};
        var minCutoff = options.minCutoff !== undefined ? options.minCutoff : 1.2;
        var beta = options.beta !== undefined ? options.beta : 0.008;

        this.x = new Filter(minCutoff, beta);
        this.y = new Filter(minCutoff, beta);
        this.pressure = new Filter(4.0, 0.0);
        this.lastTime = 0;
        this.started = false;
    }

    Pen.prototype.reset = function (x, y, pressure, time) {
        this.x.reset();
        this.y.reset();
        this.pressure.reset();
        this.lastTime = time;
        this.started = true;
        return { x: this.x.filter(x, 1 / 60), y: this.y.filter(y, 1 / 60), pressure: this.pressure.filter(pressure, 1 / 60) };
    };

    Pen.prototype.filter = function (x, y, pressure, time) {
        if (!this.started) return this.reset(x, y, pressure, time);

        var dt = (time - this.lastTime) / 1000;
        if (!(dt > 0)) dt = 1 / 120;
        this.lastTime = time;

        return {
            x: this.x.filter(x, dt),
            y: this.y.filter(y, dt),
            pressure: this.pressure.filter(pressure, dt)
        };
    };

    /** 안정화 세기를 한 손잡이로 조절한다. 0 이면 끄고 1 이면 많이 잡는다. */
    Pen.prototype.setStrength = function (t) {
        // t 가 클수록 차단을 낮춰 더 매끄럽게, 대신 beta 를 조금 올려 지연을 막는다.
        var minCutoff = 4.0 - 3.6 * t;
        var beta = 0.004 + 0.012 * t;
        this.x.minCutoff = minCutoff;
        this.y.minCutoff = minCutoff;
        this.x.beta = beta;
        this.y.beta = beta;
    };

    return { Filter: Filter, Pen: Pen };
}());
