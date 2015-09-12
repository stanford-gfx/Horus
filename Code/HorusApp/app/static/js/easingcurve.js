/*

Easing Curve Widget Design Doc
==============================


- Easing curve shows total shot evolution
- Horizontal axis is time, vertical is arc distance.
- Can change the time of any keyframe by dragging left and right, but constrained to dist.
- Can add additional other knots between kf times for interesting behavior.
- Can scale overall time which scaled everything.

- GUI: This ONLY displays the actual curve, other UI elements are outside this.

Input:
- Total shot length
- Set of keyframes with associated time and associated distance along arc.
--- doesn't have to end at max time

API: [CB = callback]
- EVENT: Time of keyframe changed
- SET: Scale entire spline [disable CB1]
- SET: New keyframe list [disable CB1, other knots stay the same, so sort into list]
- SET: Keyframe value changed  [time or distance, disable CB1]
- SET: Current time we're displaying.
- GET: Entire spline's knots
- GET: Get eased distance along arc given a time (or list of times)

 */

//Figure out how to include P5.js
define(['underscore', 'backbone', 'p5', 'env', 'splineutils', 'utils', 'models'], function (_, Backbone, p5, ENV, SplineUtils, Utils, Models) {

var clamp = function(val, min, max) {
  return Math.min(Math.max(val, min), max);
};

//COLORS
var c_bg = 40;
var c_inner_bg = 128;
var c_font = "Anaheim";
var c_title = 255;
var c_text = 200;


//Constructor
var EasingCurve = function(selector, title, w, h) {
    this.selector = selector;
    this.title = title;
    this.DISPLAY = {
        w: w || 300,
        h: h || 300,
        border: 35,
    }

    this.keyframeKnots  = [];//[{t:0,d:0,constrained:true},{t:10.5,d:25,constrained:true},{t:25.6,d:80,constrained:true}];
    this.easingKnots    = [];//[{t:5.5,d:20},{t:15.8,d:60}];
    this.knots          = [];
    this.totalTime      = 0;
    this.totalDist      = 0;
    this.currentTime = 10;

    this._createKnotList();
    //Creates a P5.js sketch for this EasingCurve instance.
    this.canvas = null;
    this.sketch = new p5(_.bind(this._createSketch, this));
    this.setupEvents();
}

_.extend(EasingCurve.prototype, Backbone.Events, {

    setupEvents: function() {
        //Bind local functions to incoming events            
    },

    // Scales everything down to the new total.
    scaleTotalTime: function(newTotal) {
        this.currentTime = -1;
        var s = newTotal / this.totalTime;
        _.each(this.knots,        function(k) { k.t*=s; });
        this.totalTime = newTotal; 
    },

    setTotalTime: function(newTotal) {
        this.currentTime = -1;
        this.totalTime = newTotal;
    },

    // Replace entire keyframe list, keep our knots intact
    setKeyframes: function(kf, t) {
        if (kf.length < 1)
            return;
        this.keyframeKnots = kf;
        this.totalTime = t;
        this.totalDist = kf[kf.length-1].d;
        this._createKnotList();
        if (this.knots.length > 1)
            this._calculateSpline();
        return this.getCurveKnots();
    },

    editKeyframeTime: function(i, t) {
        this.keyframeKnots[i].t = t;
        //Reshuffle things
        this._createKnotList();
        this._calculateSpline();
    },

    setCurrentTime: function(t) {
        this.currentTime = t;
    },

    getCurveKnots: function() {
        return this.knots;
    },
    
    //For saving
    getState: function() {
        return {
            keyframeKnots: this.keyframeKnots,
            easingKnots:   this.easingKnots,
            totalTime:     this.totalTime,
            totalDist:     this.totalDist
        };
    },

    //For loading
    setState: function(state) {
        this.keyframeKnots = state.keyframeKnots;
        this.easingKnots   = state.easingKnots;
        this.totalTime     = state.totalTime;
        this.totalDist     = state.totalDist;
        this._createKnotList();
        this._calculateSpline();
    },

    // Interpolate the given time to a distance along the keyframe'd spline.
    getDistForTime: function(t) {

    },

    resize: function(w,h) {
        this.DISPLAY.w = w;
        this.DISPLAY.h = h;
        this.p5.resizeCanvas(w,h);
    },

    displayFeasibility: function(feasibility) {
        this.lastFeasibility = feasibility;
    },
    
    _addKnot: function(k) {
        if (this.knots.length < 2 
            || k.t > this.knots[this.knots.length-1].t
            || k.t < 0
            || k.d < 0
            || k.d > this.totalDist)
                return -1;

        var insertAt = 0;
        for (var i = 0; i < this.easingKnots.length; i++) {
            insertAt = i;
            if (this.easingKnots[i].t > k.t)
                break;
        }
        this.easingKnots.splice(insertAt, 0, k);
        
        var insertAt = 0;
        for (var i = 0; i < this.knots.length; i++) {
            insertAt = i;
            if (this.knots[i].t > k.t)
                break;
        }
        this.knots.splice(insertAt, 0, k);

        return insertAt;

    },

    _editKnot: function(i, t, d) {

        //Clamp to total distance
        d = clamp(d, 0, this.totalDist);
        //Clamp to no crossovers
        t = clamp(t, 
            i == 0 ? 0 : this.knots[i-1].t, 
            i == this.knots.length - 1 ? this.totalTime : this.knots[i+1].t)


        //Constrained knots can't move in distance
        if (!this.knots[i].constrained)
            this.knots[i].d = d;

        this.knots[i].t = t;

        if (this.knots[i].kf)
            this.trigger("change:keyframe", this.knots[i]);
    },

    _editedCurve: function() {
        this.trigger("change:curve", this.knots);
    },

    _deleteKnot: function(i) {
        if (this.knots[i] && !this.knots[i].constrained) {
            var eK = this.knots[i].eK;
            this.knots.splice(i,1);
            this.easingKnots.splice(eK,1);
        }

        this._calculateSpline();
    },

    _createKnotList: function() {
        this._filterBadKnots();
        _.each(this.keyframeKnots, function(k, i) { k.kf = i; });
        _.each(this.easingKnots, function(k, i) { k.eK = i; });
        this.knots = this.keyframeKnots.concat(this.easingKnots);
        this.knots.sort(function(a,b){return a.t > b.t;});
    },

    _filterBadKnots: function() {
        var self = this;
        this.easingKnots = _.filter(this.easingKnots, function(k) { return k.d > 0 && k.d < self.totalDist});
    },

    _calculateSpline: function() {
        if (this.keyframeKnots.length < 2)
            return;

        //this._calculateSplineUsingJS();
        this._calculateSplineUsingPY();
        
    },

    _calculateSplineUsingPY: function() {
        var self = this;
    
        var points = _.map(this.knots, function(k) { return [k.t, k.d];})
        var xpoints = _.map(this.knots, function(k) { return k.t / self.knots[self.knots.length-1].t; });
        var ypoints = _.map(this.knots, function(k) { return k.d / self.totalDist; });

        var P = {
            t: xpoints,
            d: ypoints,
        }

        $.ajax({
            
            type: 'POST',
            url: '/api/get_easing_curve',
            data: JSON.stringify(P),
            contentType: "application/json; charset=utf-8",
            dataType: "json",

        }).then(function(data, status, xhr) {

            self.Tpy = SplineUtils.Spline.pytonToJSParamSpacing(data['T']);
            self.Apy = SplineUtils.Spline.pythonToJSCoefficients(data['C'], ypoints.length);

        });
    },

    _calculateSplineUsingJS: function() {
        var self = this;
        var points = _.map(this.knots, function(k) { return [k.t, k.d];})
        var xpoints = _.map(this.knots, function(k) { return k.t / self.knots[self.knots.length-1].t; });
        var ypoints = _.map(this.knots, function(k) { return k.d / self.totalDist; });

        this.Tjs = xpoints;
        this.Cjs = SplineUtils.Spline.calcCatmullRomConstraints([ypoints], this.Tjs, 3, true);
        this.Ajs = SplineUtils.Spline.calcHermiteCoefficients(this.Cjs);
    },

    //Function that creates the damn sketch. 
    //That's right Oprah, I said it, I meant it, and I'm here to represent it.
    //Go and get Dr. Phil and we can have it out.
    _createSketch: function(p5) {

        var state = this;
        var DISPLAY = state.DISPLAY;
        state.p5 = p5;

        //State variables for drawing and interaction
        var NORMDIST = 0.001;
        var DELETEDIST = 15;
        var SPLINE_SAMPLES = 200;
        var mouseWasPressed = false;
        var mouseStartedInside = false;
        var selectedKnot = -1;
        var toDeleteKnot = -1;
        var mouseOffsetX = 0;
        var mouseOffsetY = 0;

        p5.setup = function() {
            state.canvas = p5.createCanvas(state.DISPLAY.w, state.DISPLAY.h);
            state.canvas.parent(state.selector);
            p5.frameRate(30);            
        }

        p5.draw = function() {
            p5.background(37,39,33);            
            p5.smooth();

            p5.fill(255,255,255);
            p5.stroke(255,255,255);
            p5.strokeWeight(0);
            p5.textFont(c_font);
            p5.textSize(16);
            p5.textAlign(p5.CENTER);
            p5.text(state.title, DISPLAY.w/2, 20);
            p5.textSize(12);

            p5.translate(DISPLAY.border, DISPLAY.border);

            var graphW = DISPLAY.w - 2*DISPLAY.border;
            var graphH = DISPLAY.h - 2*DISPLAY.border;

            var distToPixel = graphH / state.totalDist;
            var timeToPixel = graphW / state.totalTime;

            function _y(y) {
                return graphH - y;
            }

            var mouseX = p5.mouseX - DISPLAY.border;
            var mouseY = _y(p5.mouseY - DISPLAY.border);

            //Draw Axis
            p5.strokeWeight(1);
            p5.stroke(0,0,0,255);
            p5.fill(c_inner_bg);
            p5.rect(0,0,graphW,graphH);


            var closestKnot = findClosestKnot(state.knots, mouseX / graphW, mouseY / graphH);
            var hoverKnot = closestKnot.i > 0 && closestKnot.sqdist < NORMDIST ? closestKnot.i : -1;

            //Deal with mouse interaction
            if (p5.mouseIsPressed) {
            
                if (!mouseWasPressed) { /* Click! */

                    mouseStartedInside = (mouseX <= graphW 
                        && mouseX >= 0 
                        && mouseY <= graphH 
                        && mouseY >= 0);

                    if (mouseStartedInside) { /* Click inside graph! */

                        Models.Feasibility.invalidate();

                        if (hoverKnot >= 0) {
                        
                            //Select a knot

                            selectedKnot = hoverKnot;
                            mouseOffsetX = mouseX - state.knots[selectedKnot].t * timeToPixel;
                            mouseOffsetY = mouseY - state.knots[selectedKnot].d * distToPixel;
                        
                        } else {

                            //Create a knot

                            var t = mouseX / timeToPixel;
                            var d = mouseY / distToPixel

                            var insertAt = state._addKnot({t:t, d:d});

                            selectedKnot = insertAt;
                            mouseOffsetY = 0;
                            mouseOffsetX = 0;

                        }

                        if (state.knots.length > 1)
                            state._calculateSpline();

                    }

                } else { /* Dragging! */

                    if (selectedKnot > 0) {
                        var apparentX = mouseX - mouseOffsetX;
                        var apparentY = mouseY - mouseOffsetY;
                        var t = apparentX/timeToPixel;
                        var d = apparentY/distToPixel;
                        state._editKnot(selectedKnot, t, d);

                        if (apparentX-DELETEDIST > graphW || apparentX+DELETEDIST < 0 ||
                            apparentY-DELETEDIST > graphH || apparentY+DELETEDIST < 0) {
                            toDeleteKnot = selectedKnot;
                        } else {
                            toDeleteKnot = -1;
                        }

                        if (state.knots.length > 1)
                            state._calculateSpline();
                    }

                }

            } else { /* !p5.mouseIsPressed */

                    selectedKnot = -1;
                    
                    if (mouseWasPressed && mouseStartedInside) { /* Mouse Up! */

                        if (toDeleteKnot > 0) {
                            state._deleteKnot(toDeleteKnot);
                            toDeleteKnot = -1;
                        }
                        
                        state._editedCurve();

                    }

            }

            mouseWasPressed = p5.mouseIsPressed;

            p5.strokeWeight(0.5);

            //Draw crosshairs
            if (selectedKnot < 0 
                  && hoverKnot < 0
                  && mouseX > 0 
                  && mouseX < graphW 
                  && mouseY > 0
                  && mouseY < graphH) {

                p5.stroke(0,0,0,60);

                p5.line(mouseX, 0, mouseX, graphH);
                p5.line(0, _y(mouseY), graphW, _y(mouseY));

            }

            if (state.currentTime >= 0) {
                p5.stroke(0,0,255,255);
                p5.line(state.currentTime * timeToPixel, 0, state.currentTime * timeToPixel, graphH);
            }


            if (state.knots.length < 2)
                return;

            //Javascript splines:
            //drawSpline(state.Ajs, state.Tjs, graphW, graphH, _y, 0,255,0,200);
            
            //Python splines:
            if (state.Apy)
                drawSpline(state.Apy, state.Tpy, graphW, graphH, _y, 0, 0, 0, 200);

            //Draw each knot)
            for (var i = 0; i < state.knots.length+1; i++) {
                var t = i == state.knots.length ? state.totalTime : state.knots[i].t;
                var d = i == state.knots.length ? state.totalDist : state.knots[i].d;
                var x = t * timeToPixel;
                var y = _y(d * distToPixel);

                //Draw the grid

                if (toDeleteKnot == i) {
                    p5.fill(255,0,0);
                    p5.stroke(255,0,0);
                } else if (selectedKnot == i) {
                    p5.stroke(0,0,0,255);
                    p5.fill(0,0,0);
                } else if (hoverKnot == i) {
                    p5.fill(0,255,0);
                    p5.stroke(0,255,0);
                } else {
                    p5.stroke(0,0,0,60);
                    p5.fill(0,0,0);
                }

                //Drawing the knots
                p5.rect(x-2,y-2,4,4);

                if (i == state.knots.length 
                      || state.knots[i].kf 
                      || i == selectedKnot 
                      || i == hoverKnot) {

                    p5.strokeWeight(0.5);
                    p5.line(x, 0, x, graphH);
                    p5.line(0, y, graphW, y);
                    p5.strokeWeight(0);
                    
                    p5.fill(c_text);
                    p5.textAlign(p5.CENTER);
                    p5.text(""+t.toFixed(2)+"s", x, _y(-12));
                    p5.textAlign(p5.RIGHT);
                    p5.text(""+Math.round(d)+"m", -2, y+4);


                }

                if (i == state.knots.length)
                    continue;

            }


        } /* draw */

        function findClosestKnot(knots, xnorm, ynorm) {
            var sqdist = 4.0; // in normalized space, can't be bigger than this hehe
            var k = -1;
            for (var i = 0; i < knots.length; i++) {
                var sq1dist = p5.sq(knots[i].t / state.totalTime - xnorm) + p5.sq(knots[i].d / state.totalDist - ynorm); 
                if (sq1dist < sqdist) {
                    sqdist = sq1dist;
                    k = i;
                }
            }
            return {
                i: k,
                sqdist: sqdist,
            }
        }

        //Draws a spline by sampling uniformly in T over the entire multi-segment spline.
        var drawSpline = function(A, T, graphW, graphH, _y, r, g, b, alpha) {

            var feasibility = Models.Feasibility.get();

            p5.stroke(r,g,b,alpha);
            p5.strokeWeight(0.5);            
            var ctx = p5.drawingContext;

            var deets = SPLINE_SAMPLES;
            var tstep = T[T.length-1] / deets;
            var lastTime = state.knots[state.knots.length-1].t;
            var xscale = lastTime / state.totalTime;

            var lastX = 0, lastY = graphH;
            var wasInfeasible = false;
            for (var step = 0; step <= deets; step += 1) {

                var tf = step * tstep;

                if (feasibility) {
                    var f = Utils.lookupWithDenseIndex(tf * lastTime, feasibility.reparameterizedTimes, feasibility.feasibility);
                    if (f != undefined) {
                        if (wasInfeasible) {
                            from = p5.color(0,255,0);
                            to = p5.color(255,0,0);
                            p5.stroke(p5.lerpColor(from, to, Math.max(Math.min(f.sum, 1), 0)));
                        } else {
                            p5.color(0,0,0);
                            wasInfeasible = true;
                        }
                        p5.strokeWeight(1);
                    } else {
                        if (wasInfeasible) {
                            p5.stroke(0,0,0,255);
                        } else {
                            p5.stroke(0,255,0,255);
                        }
                        wasInfeasible = false;

                        p5.strokeWeight(1);
                    }
                }
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);

                var X = SplineUtils.Spline.evalHermite(A, T, tf);
                var x = tf * xscale * graphW;
                var y = _y(X[0]*graphH);
                ctx.lineTo(x, y);
                ctx.stroke();
                lastX = x;
                lastY = y;

            }
        }

        var drawArray = function(arr, scaleX, scaleY, _y, r, g, b, alpha) {
            p5.stroke(r,g,b,alpha);
            p5.strokeWeight(0.5);
            var ctx = p5.drawingContext;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            
            for (var i = 0; i < arr.length; i++) {
                var x = i/arr.length*scaleX;
                var y = _y(arr[i]*scaleY);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

    } /* _createSketch */


});


return EasingCurve;


});