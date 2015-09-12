
    //Calculates (f(i) - f(i-1)) / h for all i
    var diff_back = function(arr, h) {
        var diff = new Array(arr.length);
        diff[0] = (arr[1] - arr[0]) / h; //Forward difference the first point. 
        for (var i = 1; i < arr.length; i++) {
            diff[i] = (arr[i] - arr[i-1])/h;
        }
        return diff;
    }


var SplineUtils = (function() {

    /* Dependencies: Sylvester */

    //NOTE: As of Dec 1 2014, this library assumes that each polynomial's coefficients
    // can be solved for independently of other polynomials. This is true for catmull-rom style
    // polynomials where the hermite constraints are preset rather than solved for.

    //Calculates (f(i) - f(i-1)) / h for all i
    var diff_back = function(arr, h) {
        var diff = new Array(arr.length);
        diff[0] = (arr[1] - arr[0]) / h; //Forward difference the first point. 
        for (var i = 1; i < arr.length; i++) {
            diff[i] = (arr[i] - arr[i-1])/h;
        }
        return diff;
    }

    //Calculates (n! / m!) assuming m < n
    var factorial = function (n,m) {
        for (var i = n-1; i > m; i--) n *= i;
        return n;
    }

    /* ================ Single Hermite Polynomial ================= 
    * Functions for calculating and evaluating a polynomial
    * of the form x(t) = Sum(a_i*t^i) where i = 0 ... degree
    * with constraints at x(0), x(1), x'(0), x'(1), ...
    * =============================================================*/

    var HermitePoly = {};

    //Cache for hermite constraint matrices, memoizes HermitePoly.getConstraintMatrix
    var ccache = {};

    // Sets up linear system matrix B^-1 to calculate coefficents based on hermite constraints.
    //
    // @degree:  positive, uneven number. Hermite polinomial degree.
    // @return:  Matrix B^-1
    HermitePoly.getConstraintMatrix =  function(degree) {
        if (ccache[degree])
            return ccache[degree];
        var n = degree+1;
        var B = Matrix.Zero(n,n);

        //Constraints evaluated at t=0:
        for (i = 0; i < n/2; i++) B.elements[i*2][i] = 1;

        //Constraints evaluated at t=1. Numerically differentiates x(t).
        for (j = 0; j < n; j++) B.elements[1][j] = 1;
        for (i = 1; i < n/2; i++) {
            for (j = i; j < n; j++) B.elements[i*2+1][j] = factorial(j,j-i);
        }

        ccache[degree] = B.inverse();
        return ccache[degree];
    };

    // Calculates the coefficient vector C=[a_0, ..., a_degree] for the polinomial.
    //
    // @P:        Vector of constraints [x(0), x(1), x'(0), x'(1), ...]
    // @return:   Vector of coefficients [a_0, ... , a_degree]
    HermitePoly.calcCoefficients = function(C) {
        return HermitePoly.getConstraintMatrix(C.elements.length-1).multiply(C);
    } 

    // Evaluates x(t) = A*[1, t, t^2, t^3, ...]
    HermitePoly.eval = function(A, t) {
        var T = Vector.Zero(A.elements.length);
        return A.dot(T.map(function(x,i){return Math.pow(t,i-1);}));
    }

    // Basis function based approach to calculating spline point:
    HermitePoly.evalCublicBasisFnct = function(p0,m0,p1,m1,t) {
        var t3 = Math.pow(t,3), t2 = Math.pow(t,2);
        var h00 = 2.0*t3-3.0*t2+1.0, h10 = t3-2.0*t2+t, h01 = -2.0*t3+3.0*t2, h11 = t3-t2;
        return h00*p0 + h10*m0 + h01*p1 + h11*m1;
    };

    // Barry Goldman recursive evaluation for arbitrary time spacing of a catmull-rom segment
    HermitePoly.evalCubicCatmullRomBarryGoldmanFnct = function (p0,p1,p2,p3,t0,t1,t2,t3,t) {
        var l01 = p0*(t1-t)/(t1-t0) + p1*(t-t0)/(t1-t0);
        var l12 = p1*(t2-t)/(t2-t1) + p2*(t-t1)/(t2-t1);
        var l23 = p2*(t3-t)/(t3-t2) + p3*(t-t2)/(t3-t2);
        var l012 = l01*(t2-t)/(t2-t0) + l12*(t-t0)/(t2-t0);
        var l123 = l12*(t3-t)/(t3-t1) + l23*(t-t1)/(t3-t1);
        var c = l012*(t2-t)/(t2-t1) + l123*(t-t1)/(t2-t1);
        return c;
    }

    /* ================ Multi-Segment Hermite Spline ================= 
    * Functions for working with multidimensional multi-segment Hermite polinomials
    *
    **/

    var Spline = {};

    //Calculate the knot offsets in parameter space
    //
    // @knots: array of [x, y, z, ...] points
    // @alpha: spacing parameter. 0: even, 0.5: centripetal 1: euclidian dist. weighing
    Spline.calcParameterSpacing = function(knots, alpha) {
        u = [0.0];
        for (var i = 0; i < knots.length-1; i++) {
            var sqdist = 0;
            for (var d = 0; d < knots[i].length; d++) sqdist += Math.pow(knots[i+1][d] - knots[i][d], 2);
            u.push(u[i] + Math.pow(Math.sqrt(sqdist), alpha));
        }
        return u;
    };

    // Helper functions to calculate nonuniformly-spaced tangents for Catmull-Rom tangents
    var catmullRomTangent  = function(p0,p1,p2,t0,t1,t2) { return (p1-p0)/(t1-t0) - (p2-p0)/(t2-t0) + (p2-p1)/(t2-t1); }
    var catmullRomTangent1 = function(p0,p1,t0,t1) { return 0;}//(p1-p0)/(t1-t0); }

    // Given a set of knots and parameters, calculates the constraints C for every segment using Catmull-Rom Tangents
    //
    // @X: Multidimensional set of knots. Array of array of points.
    // @T: Array of parameter values for every knot
    // @return: List of list of vector of constraints per segment [[x0(0), x0'(0), ..., x0(1), x0'(1)...], [...]]
    Spline.calcCatmullRomConstraints = function(X, T, degree) {

        if (degree < 1 || degree % 2 != 1) {
            console.error("Catmull Rom degree needs to be uneven and positive.");
            return;
        }

        var C = new Array(X.length);

        //For every dimension of the spline, independently calculate constraints.
        for (var dim = 0; dim < X.length; dim++) {

            var Xd = X[dim];

            var P = new Array(Xd.length-1);
            for (var i = 0; i < P.length; i++) {
                P[i] = new Vector.Zero(degree+1);
            }

            var td = T[0]
            //Calculate first order tangents
            var m1 = new Array(Xd.length);
            for (var i = 0; i < Xd.length; i++) {
                if (i == 0)                { m1[i] = catmullRomTangent1(Xd[0], Xd[1], T[0], T[1]); }
                else if (i == Xd.length-1) { m1[i] = catmullRomTangent1(Xd[i-1], Xd[i], T[i-1], T[i]); }
                else                       { m1[i] = catmullRomTangent(Xd[i-1], Xd[i], Xd[i+1], T[i-1], T[i], T[i+1]); }
            }

            var M = new Array((degree-1)/2);
            for (d = 0; d < (degree-1)/2; d++) {
                M[d] = m1;
                m1 = diff_back(m1.slice(0), 1);
            }

            for (var i = 0; i < Xd.length-1; i++) {

                var td = T[i+1] - T[i];
                
                P[i].elements[0] = Xd[i];
                P[i].elements[1] = Xd[i+1];

                for (var d = 0; d < (degree-1)/2; d++) {
                    P[i].elements[(d*2+2)] = td*M[d][i];
                    P[i].elements[(d*2+3)] = td*M[d][i+1];
                }

            }

            C[dim] = P;

        }

        return C;

    }

    // Given a set of constraints per polinomail segment, calculates the coefficients that define every polinomial.
    //
    // @C: Multidimensional spline: Lists of list of vector of constraints [[x0(0), x0'(0), ..., x0(1), x0'(1)...], ...]
    // @return: "A", a list of list vector of coefficients, ready to pass to evalHermiteSpline
    Spline.calcHermiteCoefficients = function(C) {
        var S = new Array(C.length);
        for (var d = 0; d < C.length; d++) {
            var A = new Array(C[d].length);
            for (var i = 0; i < C[d].length; i++) {
                A[i] = HermitePoly.calcCoefficients(C[d][i]);
            }
            S[d] = A;
        }
        return S;
    }

    // Evaluates a polinomial defined by the coefficients in A
    // Polinomial takes the form of Sum(A_i * t^i)
    //
    // @A: For every dimension, a list of vector of coefficients. 
    // @T: knot parameter range
    // @t: value along parameter to calculate
    // @return: List of interpolated points.
    Spline.evalHermite = function(A, T, t) {

        //assert(T.length > 1);

        //Which segment are we in?
        var i = 0;
        while (t > T[i+1] && i < T.length-2)
            i++;
        var u = (t - T[i]) / (T[i+1] - T[i]);

        var X = new Array(A.length);
        for (var d = 0; d < A.length; d++) {
            X[d] = HermitePoly.eval(A[d][i], u);
        }

        return X;
    }

    return {
        HermitePoly: HermitePoly,
        Spline: Spline
    }

})();


var knots;
var t;
var mikeSpline = null;

var easingCurveEditor = function(p5s) {

    var CONFIG = {
        w: 340,
        h: 380,
        ir: 300,
        io: 25,
        alpha: 0.5,
        splineDetail: 40,
        poliDetail: 40,
        tscale:100,
        showDisc: false,
        showDeriv: 1,
        sampleInU: false,
    }

    /* Knot values always stay between 0 and 1. */
    var knots = [[0,0],[1,1]];
    //var knots = [[0,0],[0.2,0.2],[0.533,0.766],[0.566,0.746],[0.8,0.2],[1,1]];

    var selectedKnots = [];

    function findClosestKnot(mx, my) {
        var xs = mx / CONFIG.ir;
        var ys = my / CONFIG.ir;

        var sqdist = 4.0; // in normalized space, can't be bigger than this hehe
        var k = -1;
        for (var i = 0; i < knots.length; i++) {
            var sq1dist = p5s.sq(knots[i][0] - xs) + p5s.sq(knots[i][1] - ys); 
            if (sq1dist < sqdist) {
                sqdist = sq1dist;
                k = i;
            }
        }
        return {
            k: k,
            sqdist: sqdist,
        }
    }

    /* Editing Options */
    var symmetricEditing = false;
    var constrainStartEnd = false;

    var alphaSlider;

    p5s.setup = function() {
      var canvas = p5s.createCanvas(CONFIG.w,CONFIG.h);
      canvas.parent('easingTool');
      p5s.frameRate(60);
    }

    var mouseWasPressed = false;
    var mouseOffsetX = 0;
    var mouseOffsetY = 0;

    /* FEASIBILITY CHECK */

    var isFunction = true;



    /* API CODE */

    /* PASS IN: */

    var keyframes = {
        l: [{t:0,d:0}, {t:12,d:15}, {t:24,d:27}, {t:26, d:29}],
    }
    keyframes.totalT = keyframes.l[keyframes.l.length-1].t;
    keyframes.totalD = keyframes.l[keyframes.l.length-1].d;

    /*

    Return set of points and corresponding time values, and
    return whether points are a valid function or not

    Given x, return y and dy/dx.

    Given x range, return y and dy/dx range.
    
    Given number of sample points per segment, return sampled curve

    */

    /* DRAWING CODE */

    var drawButton = function(x,y,w,h,ch,chP,pressed,onpress) {
        if (pressed) {
            p5s.stroke(200,200,200,0);
            p5s.fill(200,200,200);
        } else {
            p5s.stroke(0,0,0);
            p5s.fill(255,255,255);
        }
        p5s.rect(x-1,y-1,w,h);
        if (pressed) {
            p5s.stroke(128,128,128);
            p5s.line(x,y,x+w,y);
            p5s.line(x,y,x,y+h);
        } else {
            p5s.stroke(128,128,128);
            p5s.line(x,y+h,x+w,y+h);
            p5s.line(x+w,y,x+w,y+h);
        }
        p5s.stroke(0,0,0);
        p5s.fill(0,0,0);
        if (pressed)
            p5s.text(chP,x+w/4,y+11*h/16);
        else
            p5s.text(ch,x+w/4,y+11*h/16);
        p5s.fill(0,0,0,0);

        if (p5s.mouseX < x+w && p5s.mouseX > x && p5s.mouseY < y+w && p5s.mouseY > y) {
            if (p5s.mouseIsPressed && !mouseWasPressed)
                if (onpress)
                    onpress();

        }
    }



    var drawTangent = function (x, y, tx, ty) {
        p5s.line(
            x*CONFIG.ir,
            y*CONFIG.ir,
            x*CONFIG.ir+tx*CONFIG.tscale,
            y*CONFIG.ir+ty*CONFIG.tscale);
    }
     

    var drawArray = function(xarr, yarr, xscale, yscale) {
        var ctx = p5s.drawingContext;
        ctx.beginPath();
        ctx.moveTo(xarr[0] * CONFIG.ir * xscale, yarr[0] * CONFIG.ir * yscale);
        for (var i = 1; i < xarr.length; i++) {
            ctx.lineTo(xarr[i] * CONFIG.ir * xscale, yarr[i] * CONFIG.ir * yscale);
        }
        ctx.stroke();      
    }


    //Draws a spline by sampling uniformly in T over the entire multi-segment spline.
    var drawSpline = function(A, T, r,g,b,alpha) {
        var xp = 0.0, yp = 0.0, dxdy = [], xseq = [];

        p5s.stroke(r,g,b,alpha);
        var ctx = p5s.drawingContext;
        ctx.beginPath();
        ctx.moveTo(knots[0][0]*CONFIG.ir, knots[0][1]*CONFIG.ir);

        isFunction = true;

        var deets = CONFIG.splineDetail * knots.length;
        var tstep = T[T.length-1] / deets;
        for (var step = 0; step <= deets; step += 1) {

            var tf = step * tstep;
            var X = SplineUtils.Spline.evalHermite(A, T, tf);
            var x = X[0];
            var y = X[1];
            ctx.lineTo(x*CONFIG.ir, y*CONFIG.ir);
            if (CONFIG.showDisc)
                ctx.strokeRect(x*CONFIG.ir, y*CONFIG.ir,1,1);

            if (x < xp) {
                p5s.stroke(255,0,0,255);
                isFunction = false;
                console.log(x-xp, x, xp);
            }

            var dxdt = ((x - xp) / tstep);
            var dydt = ((y - yp) / tstep);
            //if (xp != 0 && dxdt != 0 && !isNaN(dxdt) && !isNaN(dydt)){
                xseq.push(x)
                dxdy.push(dydt / dxdt);
            //}
            
            xp = x;
            yp = y;

        }
        dxdy[0] = dxdy[1];
        ctx.stroke();

        if (CONFIG.showDeriv >= 1) {
            p5s.stroke(0,0,255,alpha);
            drawArray(xseq, dxdy, 1, 1/8);
        }
        if (CONFIG.showDeriv >= 2) {
            p5s.stroke(0,255,0,alpha);
            dxdy2 = diff_back(dxdy, tstep);
            drawArray(xseq, dxdy2, 1, 1/32);
        }

        if (CONFIG.showDeriv >= 3) {
            p5s.stroke(255,0,0,alpha);
            dxdy3 = diff_back(dxdy2, tstep);
            drawArray(xseq, dxdy3, 1, 1/64);
        }
        if (CONFIG.showDeriv >= 4) {
            p5s.stroke(r,g,b,alpha);
            dxdy4 = diff_back(dxdy3, tstep);
            drawArray(xseq, dxdy4, 1, 1/1000);
        }

    }

    //Draws a spline by uniformly sampling every polinomial across [0,1], then scaling.
    var drawEachPolynomial = function(A, T, r,g,b,alpha) {

        var xp = 0.0, yp = 0.0, tp = 0.0, dxdy = [], xseq = [];

        p5s.stroke(r,g,b,alpha);
        var ctx = p5s.drawingContext;
        ctx.beginPath();
        ctx.moveTo(knots[0][0]*CONFIG.ir, knots[0][1]*CONFIG.ir);

        isFunction = true;
        for (var i = 0; i < knots.length-1; i++) {

            var td = T[i+1] - T[i];
            for (var s = 0; i == knots.length-2 ? s <= CONFIG.poliDetail: s < CONFIG.poliDetail; s += 1) {
                var u = parseFloat(s)/CONFIG.poliDetail;
                var x = SplineUtils.HermitePoly.eval(A[0][i],u);
                var y = SplineUtils.HermitePoly.eval(A[1][i],u);
                ctx.lineTo(x*CONFIG.ir,y*CONFIG.ir);
                if (CONFIG.showDisc)
                    ctx.strokeRect(x*CONFIG.ir,y*CONFIG.ir,1,1);

                if (x < xp) {
                    p5s.stroke(255,0,0,255);
                    isFunction = false;
                    console.log(x-xp, x, xp);
                }
                var t = T[i] + u*td;
                var dxdt = ((x - xp) / (t - tp));
                var dydt = ((y - yp) / (t - tp));
                //if (xp != 0 && dxdt != 0 && !isNaN(dxdt) && !isNaN(dydt)){
                    xseq.push(x)
                    dxdy.push(dydt / dxdt);
                //}
                
                xp = x;
                yp = y;
                tp = t;

            }

        }
        dxdy[0] = dxdy[1];

        ctx.stroke();

        if (CONFIG.showDeriv >= 1) {
            p5s.stroke(0,0,255,alpha);
            drawArray(xseq, dxdy, 1, 1/8);
        }
        if (CONFIG.showDeriv >= 2) {
            p5s.stroke(0,255,0,alpha);
            dxdy2 = diff_back(dxdy, tstep);
            drawArray(xseq, dxdy2, 1, 1/32);
        }

        if (CONFIG.showDeriv >= 3) {
            p5s.stroke(255,0,0,alpha);
            dxdy3 = diff_back(dxdy2, tstep);
            drawArray(xseq, dxdy3, 1, 1/64);
        }
        if (CONFIG.showDeriv >= 4) {
            p5s.stroke(r,g,b,alpha);
            dxdy4 = diff_back(dxdy3, tstep);
            drawArray(xseq, dxdy4, 1, 1/128);
        }

    }


    p5s.draw = function() {

        /* Clear the screen */
        p5s.background(255);
        p5s.smooth();

        /* Draw the UI */
        drawButton(26,2,20,20,"S","S", symmetricEditing, function() { symmetricEditing=!symmetricEditing});
        drawButton(49,2,20,20,'C',"C", constrainStartEnd, function() { constrainStartEnd=!constrainStartEnd});
        drawButton(72,2,20,20,"T","U", CONFIG.sampleInU, function() { CONFIG.sampleInU=!CONFIG.sampleInU});

        /* Set bottom-left as (0,0) */
        p5s.translate(0,CONFIG.h);
        p5s.scale(1,-1);

        /* Offset the grid drawing */
        p5s.translate(CONFIG.io,CONFIG.h - CONFIG.io - CONFIG.ir);

        var mouseXtransformed = p5s.mouseX - CONFIG.io;
        var mouseYtransformed = CONFIG.h - 2*CONFIG.io - p5s.mouseY;

        /* Draw the axis*/
        p5s.strokeWeight(1);
        p5s.stroke(0,0,0,255);
        p5s.rect(0,0,CONFIG.ir,CONFIG.ir);
        
        p5s.strokeWeight(0.5);
        p5s.stroke(0,0,0,100);
        p5s.fill(0,0,0,100);

        for (var i = 0; i < keyframes.l.length; i++) {
            var tx = keyframes.l[i].t/keyframes.totalT*CONFIG.ir;
            var ty = keyframes.l[i].d/keyframes.totalD*CONFIG.ir;
            p5s.line(tx, 0, tx, CONFIG.ir);
            p5s.line(0, ty, CONFIG.ir, ty);
            p5s.text("k"+i, -20, ty+5);
            p5s.text(""+keyframes.l[i].t + "s", tx-5, 0);
        }

        var closestKnot = findClosestKnot(mouseXtransformed, mouseYtransformed);
        var closestKnotSymmetric = findClosestKnot(CONFIG.ir - mouseXtransformed, CONFIG.ir - mouseYtransformed);

        if (p5s.mouseIsPressed) {

            //A click happened!
            if (!mouseWasPressed) {

                if (mouseXtransformed > CONFIG.ir || mouseXtransformed < 0 || 
                    mouseYtransformed > CONFIG.ir || mouseYtransformed < 0) {

                } else if (closestKnot.k >= 0 && closestKnot.sqdist < 0.002 && closestKnot.k != 0 && closestKnot.k != knots.length-1) {
                    //If there is a knot close, select it
                    selectedKnots = [closestKnot.k];
                    mouseOffsetX = mouseXtransformed - knots[selectedKnots[0]][0]*CONFIG.ir;
                    mouseOffsetY = mouseYtransformed - knots[selectedKnots[0]][1]*CONFIG.ir;
                    if (symmetricEditing) {
                        if (closestKnotSymmetric.sqdist <= closestKnot.sqdist + 0.001) {
                            selectedKnots.push(closestKnotSymmetric.k);
                        }
                    }
                } else {
                    //If there is no knot close, add a knot
                    var x = mouseXtransformed/CONFIG.ir;
                    var y = mouseYtransformed/CONFIG.ir;
                    var newKnots = [[x,y]]

                    if (symmetricEditing) {
                        x = 1.0-x;
                        y = 1.0-y;
                        newKnots.push([x,y]);
                    }
                    
                    for (var k = 0; k < newKnots.length; k++) {
                        var insertAt = 0;
                        for (var i = 0; i < knots.length; i++) {
                            insertAt = i;
                            if (knots[i][0] > newKnots[k][0]) {
                                break;
                            }
                        }
                        if (knots.length > 0 && knots[knots.length-1][0] < newKnots[k][0])
                            insertAt = knots.length;

                        knots.splice(insertAt, 0, newKnots[k]);
                    }

                    selectedKnots = [];
                    for (var i = 0; i < knots.length; i++) {
                        for (var k = 0; k < newKnots.length; k++) {
                            if (knots[i] === newKnots[k])
                                selectedKnots.push(i);                               
                        }
                    }
                    if (x < 0.5)
                        selectedKnots = selectedKnots.reverse();

                }

            }

            mouseWasPressed = p5s.mouseIsPressed;

        } else {

            //check whether we dragged it off the screen or made infeasible
            if (selectedKnots.length >= 0 && mouseWasPressed) {
                for (var s = 0; s < selectedKnots.length; s++) {
                        if (knots[selectedKnots[s]][0] < 0 || knots[selectedKnots[s]][0] > 1 || 
                                knots[selectedKnots[s]][1] < 0 || knots[selectedKnots[s]][1] > 1 || !isFunction) {
                            knots[selectedKnots[s]].remove = true;
                        }

                } 
            }
            for (var i = 0; i < knots.length; i++) {
                if (knots[i].remove)
                    knots.splice(i, 1)
            }

            //check whether we dragged it to cause a non-function

            selectedKnots = [];
            mouseWasPressed = false;
        }

        if (selectedKnots.length > 0) {
            var x = (mouseXtransformed - mouseOffsetX) / CONFIG.ir;
            var y = (mouseYtransformed - mouseOffsetY) / CONFIG.ir;
            knots[selectedKnots[0]][0] = x;
            knots[selectedKnots[0]][1] = y;
            if (symmetricEditing && selectedKnots.length > 1) {
                knots[selectedKnots[1]][0] = 1.0-x;
                knots[selectedKnots[1]][1] = 1.0-y;
            }
        }

        p5s.strokeWeight(1);
        p5s.stroke(0,0,0);
        for (var i = 0; i < knots.length; i++) {
             if (selectedKnots[0] == i || (symmetricEditing && selectedKnots[1] == i)) {
                p5s.strokeWeight(0.5);
                p5s.stroke(0,0,0,100);
                p5s.line(knots[i][0]*CONFIG.ir, 0, knots[i][0]*CONFIG.ir, CONFIG.ir);
                p5s.line(0, knots[i][1]*CONFIG.ir, CONFIG.ir, knots[i][1]*CONFIG.ir);
                p5s.strokeWeight(1);
                p5s.fill(0,0,0);
                p5s.stroke(0,0,0);

            } else if ((closestKnot.k == i && closestKnot.sqdist < 0.002) || 
                    (symmetricEditing && closestKnotSymmetric.k == i && closestKnotSymmetric.sqdist < 0.002)) {
                p5s.fill(255,0,0);
                p5s.stroke(255,0,0);
            } else {
                p5s.noFill();
                p5s.stroke(0,0,0);
            }
            p5s.rect(knots[i][0]*CONFIG.ir-2,knots[i][1]*CONFIG.ir-2,4,4);
        }


        var xpoints = _.map(knots, function(k) { return k[0]; });
        var ypoints = _.map(knots, function(k) { return k[1]; });

        var T = SplineUtils.Spline.calcParameterSpacing(knots, CONFIG.alpha);
        var C = SplineUtils.Spline.calcCatmullRomConstraints([xpoints, ypoints], T, 3);
        var A = SplineUtils.Spline.calcHermiteCoefficients(C);

        if (CONFIG.sampleInU) {
            drawEachPolynomial(A, T, 0, 0, 0, 128);
        } else {
            drawSpline(A, T, 0, 0, 0, 128);
        }
        

        // var Ts = xpoints;
        // var Cs = SplineUtils.Spline.calcCatmullRomConstraints([ypoints], Ts, 3);
        // var As = SplineUtils.Spline.calcHermiteCoefficients(Cs);

        // (function drawSingleSpline(r,g,b,alpha) {

        //     var xp = 0.0, yp = 0.0, dxdy = [], xseq = [];

        //     p5s.stroke(r,g,b,alpha);
        //     var ctx = p5s.drawingContext;
        //     ctx.beginPath();
        //     ctx.moveTo(knots[0][0]*CONFIG.ir, knots[0][1]*CONFIG.ir);

        //     isFunction = true;

        //     var deets = CONFIG.splineDetail * knots.length;
        //     var tstep = Ts[Ts.length-1] / deets;
        //     for (var step = 0; step <= deets; step += 1) {
        //         var tf = step * tstep;
        //         var X = SplineUtils.Spline.evalHermite(As, Ts, tf);
        //         var x = tf;
        //         var y = X[0];
        //         ctx.lineTo(x*CONFIG.ir, y*CONFIG.ir);
        //         if (CONFIG.showDisc)
        //             ctx.strokeRect(x*CONFIG.ir, y*CONFIG.ir,1,1);

        //         if (x < xp) {
        //             p5s.stroke(255,0,0,255);
        //             isFunction = false;
        //             console.log(x-xp, x, xp);
        //         }

        //         //var dxdt = ((x - xp) / tstep);
        //         var dydt = ((y - yp) / tstep);
        //         //if (xp != 0 && dxdt != 0 && !isNaN(dxdt) && !isNaN(dydt)){
        //             xseq.push(x)
        //             dxdy.push(dydt);
        //         //}
                
        //         xp = x;
        //         yp = y;

        //     }
        //     dxdy[0] = dxdy[1];
        //     ctx.stroke();

        //     p5s.stroke(0,0,255,alpha);
        //     drawArray(xseq, dxdy, 1, 1/8);

        //     // p5s.stroke(0,255,0,alpha);
        //     // dxdy2 = diff_back(dxdy, tstep);
        //     // drawArray(xseq, dxdy2, 1, 1/32);

        //     // p5s.stroke(255,0,0,alpha);
        //     // dxdy3 = diff_back(dxdy2, tstep);
        //     // drawArray(xseq, dxdy3, 1, 1/64);

        //     // p5s.stroke(r,g,b,alpha);
        //     // dxdy4 = diff_back(dxdy3, tstep);
        //     // drawArray(xseq, dxdy4, 1, 1/128);



        // })(0,0,255,0);     

        

        // (function drawMikeSpline(r,g,b,alpha) {

        //     if (mikeSpline) {
        //         p5s.stroke(r,g,b,alpha);
        //         var ctx = p5s.drawingContext;
        //         ctx.beginPath();
        //         ctx.moveTo(mikeSpline[0][0]*CONFIG.ir, mikeSpline[0][1]*CONFIG.ir);

        //         for (var i = 0; i < mikeSpline.length; i++) {

        //             ctx.lineTo(mikeSpline[i][0]*CONFIG.ir,mikeSpline[i][1]*CONFIG.ir)
        //         }

        //         ctx.stroke();

        //     }

        // })(0,255,0,80);


        (function drawSigmoid(r,g,b,alpha) {

            p5s.stroke(r,g,b,alpha);

            var ctx = p5s.drawingContext;
            ctx.beginPath();
            ctx.moveTo(0,0);

            for (var s = 0; s <= CONFIG.poliDetail; s += 1) {
                var t = s / parseFloat(CONFIG.poliDetail);

                var ts = t * 12 - 6;

                var y = 1 / (1 + Math.pow(Math.E, -1*ts));

                ctx.lineTo(t*CONFIG.ir, y*CONFIG.ir);

            }

            ctx.stroke();

        })(0,0,0,25);


    }



}

var myEasingCurveEditor = new p5(easingCurveEditor);

function getMikeSpline() {
        
    send_request = {
        't':t,
        'x':_.map(knots, function(k) { return k[0]; }),
        'y':_.map(knots, function(k) { return k[1]; })
    }


    $.ajax({
        type: 'POST',
        url: '/api/get_easing_curve',
        data: JSON.stringify(send_request),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
    }).then(function(data, status, xhr) {
        if (data) {

            mikeSpline = data['P']

        } else {
            alert('Failed to get spline back');
            mikeSpline = null;
        }
    })


}
