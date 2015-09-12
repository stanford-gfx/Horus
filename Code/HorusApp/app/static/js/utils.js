define(['underscore', 'jquery'], function (_, $) {

    utils = {};

    // t is a continuous value somewhere between t_index[0] and t_index[t_index.length]
    // t_index and v_index is a sampled set of indices and values.
    // assumes t_index is monotonically increasing
    utils.lookupWithDenseIndex = function(t, t_index, v_index) {
        var imin = 0;
        var imax = t_index.length;
        if (t < t_index[0] || t > t_index[t_index.length-1]) {
            return undefined;
        }

        while (imax >= imin) {
            var i = Math.floor((imax + imin) / 2);
            if (t >= t_index[i] && t <= t_index[i+1]) {
                return v_index[i];
            } else if (t_index[i] < t) {
                imin = i+1;
            } else {
                imax = i-1;
            }
        }
        console.log("failed to find", t, t_index);
        return undefined;

    };

    // Blends color using gamma blending
    utils.lerpColor = function (c1, c2, amt) {
        amt = Math.max(Math.min(amt, 1), 0);
        if (c1 instanceof Array) {
            var c = [];
            for (var i = 0; i < c1.length; i++) {
                c.push(Math.sqrt(utils.lerp(c1[i]*c1[i], c2[i]*c2[i], amt)));
            }
            return c;
        } else {
            return Math.sqrt(utils.lerp(c1*c1, c2*c2, amt));
        }
    },

    utils.lerp = function (start, stop, amt) {
        return amt * (stop - start) + start;
    };

    utils.isNum = function (n) {
        var i = parseInt(n);
        var num = Number(n);
        return (num === i && num%1===0);
    }

    return utils;    

});
