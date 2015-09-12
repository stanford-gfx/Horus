define(['underscore', 'backbone', 'env', 'coord_system', 'splineutils'], function(_, Backbone, ENV, CoordSystem, SplineUtils) {

	var Trajectory = function(model, options) { //takes in options and model?
		this.model = model;
		this.keyframeList = [];
        this.keyframeTimes = [];

        this.posUnsampledTvals = [];
        this.posSamplesListLLH = [];
        this.posReparamTvals = [];

        this.lookAtUnsampledTvals = [];
        this.lookAtSamplesListLLH = [];
        this.lookAtReparamTvals = [];

        /* support for dense trajectories */
        this.lastCalculatedDenseTrajectory = false;
        this.optimizedLookFromSamples = [];
        this.optimizedLookAtSamples = [];
        this.optimizedTimes = [];

        this.lookAtCoeff = [];
        this.posCoeff = [];

        this.refLLH = {};

        this.reparameterizedTimes = [];

        this.totalTime = 0; //in seconds

	}

    var matricesToLists = function(P_matrix) {
        var lookFromList = [];
        var lookAtList = [];
        for (var i = 0; i < P_matrix.length; i++) {
            lookFromList.push({
                lat: P_matrix[i][0],
                lng: P_matrix[i][1],
                altitude: P_matrix[i][2],
            });

            lookAtList.push({
                lat: P_matrix[i][3],
                lng: P_matrix[i][4],
                altitude: P_matrix[i][5],
            });
        }
        return {lookFromList : lookFromList, lookAtList: lookAtList};
    }

    var getSampledSpline = function(coefficients, tvals, refLLH, samplesPerKeyframe) {
        var numSamples = samplesPerKeyframe * tvals.length; //25 samples per keyframe
        var tstep = tvals[tvals.length-1] / numSamples;
        var samplesListLLH = [];
        var sampledTList = [];
        for (var step = 0; step <= numSamples; step ++) {
            var tf = step * tstep;
            var X = SplineUtils.Spline.evalHermite(coefficients, tvals, tf);
            var sampleNED = {n: X[0], e: X[1], d: X[2]};
            var sampleLLH = CoordSystem.ned2llh(sampleNED, refLLH);
            samplesListLLH.push(sampleLLH);
            sampledTList.push(tf);
        }
        return samplesListLLH;
    }

    var getIndexForTime = function(timeList, newTime) {
        for (var i = 0; i < timeList.length; i++) {
            if (timeList[i] == newTime) 
                return {index: i, isEqual: true};
            if (timeList[i] > newTime)
                return {index: i, isEqual: false};
        }

        return {index: timeList.length, isEqual: false};
    }

    var extendWithNED = function(keyframe, ref_llh) {
        keyframe.lookFromNED = CoordSystem.llh2ned(ref_llh, keyframe.cameraPose);
        keyframe.lookAtNED   = CoordSystem.llh2ned(ref_llh, keyframe.lookAt);
        return keyframe;
    }

	//each time the keyframe list changes, call the recalculate everything method, do the calls to route in here
	_.extend(Trajectory.prototype, Backbone.Events, {
        appendKeyframes: function(keyframeList, keyframeTimes) {
            var appendToIndex = this.keyframeList.length;
            this.keyframeTimes = this.keyframeTimes.concat(keyframeTimes);
            this.keyframeList = this.keyframeList.concat(keyframeList);
            this.notifyChange(appendToIndex);
        },

        setKeyframes: function(keyframeList, keyframeTimes, refLLH) {
            this.keyframeTimes = _.clone(keyframeTimes);
            this.keyframeList = _.clone(keyframeList);
            if (refLLH) {
                this.refLLH = refLLH;
            } else {
                this.ensureNED();
            }
            this.notifyChange(0);
        },

        ensureRefLLH: function() {
            if (!this.refLLH.lat) {
                if (this.keyframeList.length == 0)
                    this.refLLH = _.clone(this.model.pose);
                else
                    this.refLLH = _.clone(this.keyframeList[0].cameraPose);
            }
        },

        ensureNED: function() {
            this.ensureRefLLH();
            for (var i = 0; i < this.keyframeList.length; i++) {
                this.keyframeList[i] = extendWithNED(this.keyframeList[i], this.refLLH);
            }
            console.log(this.keyframeList)
        },

        insertKeyframe: function(time) {
            this.ensureRefLLH();
            var keyframe = {
                cameraPose:  _.clone(this.model.pose),
                lookAt:      _.clone(this.model.lookAt),
                lookFromNED: null,
                lookAtNED:   null
            };
            keyframe.cameraPose = _.extend(keyframe.cameraPose, CoordSystem.llh2Euler(keyframe.cameraPose, keyframe.lookAt));

            keyframe = extendWithNED(keyframe, this.refLLH);

            var idx = getIndexForTime(this.keyframeTimes, time);
            if (idx.isEqual) {
                this.keyframeList[idx.index] = keyframe;
            } else {
                if (idx.index == this.keyframeTimes.length) {
                    this.keyframeTimes.push(time);
                    this.keyframeList.push(keyframe);
                } else {
                    this.keyframeTimes.splice(idx.index, 0, time);
                    this.keyframeList.splice(idx.index, 0, keyframe);
                }
            }

            this.notifyChange(idx.index);
        },

        modifyKeyframeAtIndex: function(ind, noScrub) {
            this.ensureRefLLH();
            var newKeyframe = {
                cameraPose: _.clone(this.model.pose),
                lookAt:     _.clone(this.model.lookAt),
                lookFromNED: null,
                lookAtNED:   null                
            }
            newKeyframe.lookFromNED = CoordSystem.llh2ned(this.refLLH, newKeyframe.cameraPose);
            newKeyframe.lookAtNED   = CoordSystem.llh2ned(this.refLLH, newKeyframe.lookAt);

            if (!_.isEqual(this.keyframeList[ind], newKeyframe)) {
                this.keyframeList[ind] = newKeyframe;
                this.notifyChange(ind, noScrub);
            }
        },

        modifyKeyframeTimeAtIndex: function(ind, t) {
            this.keyframeTimes[ind] = t;
        },

        removeKeyframeAtIndex: function(ind) {
            if (ind > 0) {
                this.keyframeList.splice(ind, 1);
                this.keyframeTimes.splice(ind, 1);
                //ind = ind > this.keyframeList.length ? ind - 1 : ind;
                ind -= 1;
                this.notifyChange(ind);
            }
        },

        scaleKeyframeTimes: function(factor) {
            for (var i = 0; i < this.keyframeTimes.length; i ++) {
                this.keyframeTimes[i] = this.keyframeTimes[i] * factor;
            }
        },

        scaleKeyframeTimesAfterElapsed: function(factor, elapsed) {
            //binary search
            var max_index = this.keyframeTimes.length - 1;
            var min_index = 0;

            while (max_index - min_index > 1) {
                var mid = Math.floor((max_index + min_index) / 2);
                if (this.keyframeTimes[mid] >= elapsed) {
                    max_index = mid;
                } else {
                    min_index = mid;
                }
            }
            //what do I expect max to be; what do I expect min to be?
            for (var i = max_index; i < this.keyframeTimes.length; i++) {
                this.keyframeTimes[i] = (this.keyframeTimes[i] - elapsed) * factor + elapsed;
            }

        },

        setTotalTime: function(ms) {
            this.totalTime = ms/1000;
            this.model.updateTrajectory({trajectory: this});
        },

        setStartAltitude: function(altitude) {
            this.startAltitude = altitude;
        },

        getStartAltitude: function() {
            return this.startAltitude;
        },

        notifyChange: function(index, noScrub) {
            var self = this;
            this.calculateSpline(this.keyframeList, this.refLLH, function (lookAtSplineData, cameraPosSplineData) {
                self.posUnsampledTvals = cameraPosSplineData.unsampledTvals;
                self.posSamplesListLLH = cameraPosSplineData.sampledPointsLLH;
                self.posCoeff = cameraPosSplineData.coefficients;
                self.posDist  = cameraPosSplineData.dist;

                self.lookAtUnsampledTvals = lookAtSplineData.unsampledTvals;
                self.lookAtSamplesListLLH = lookAtSplineData.sampledPointsLLH;
                self.lookAtCoeff = lookAtSplineData.coefficients;
                self.lookAtDist  = lookAtSplineData.dist;

                /* support for dense trajectories */
                self.lastCalculatedDenseTrajectory = false;

                self.model.updateTrajectory({trajectory: self, changedIndex: index, noScrub: noScrub});
            }, function() {
                self.posSamplesListLLH = [];
                self.lookAtSamplesListLLH = [];
                self.posTimesList = [0.0];
                self.model.updateTrajectory({trajectory: self, changedIndex: 0, noScrub: noScrub})

            });
        }, 


        keyframesToArrays: function(keyframeList) {
            return {
                lookAtN  : _.map(keyframeList, function(keyframe) { return keyframe.lookAtNED.n;   }),
                lookAtE  : _.map(keyframeList, function(keyframe) { return keyframe.lookAtNED.e;   }),
                lookAtD  : _.map(keyframeList, function(keyframe) { return keyframe.lookAtNED.d;   }),
                lookFromN: _.map(keyframeList, function(keyframe) { return keyframe.lookFromNED.n; }),
                lookFromE: _.map(keyframeList, function(keyframe) { return keyframe.lookFromNED.e; }),
                lookFromD: _.map(keyframeList, function(keyframe) { return keyframe.lookFromNED.d; }),
            }
        },

        easingCurveKnotsToArrays: function(knots, totalDist) {
            var points = _.map(knots, function(k) { return [k.t, k.d];})
            var xpoints = _.map(knots, function(k) { return k.t / knots[knots.length-1].t; });
            var ypoints = _.map(knots, function(k) { return k.d / totalDist; });

            var arrays = {
                t: xpoints,
                d: ypoints,
            }

            return arrays;
        },

        fullTrajectoryToArrays: function(keyframeList, lookAtT, lookFromT, lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist, refLLH) {
            var lookAtEasingArrs = this.easingCurveKnotsToArrays(lookAtEasingKnots, lookAtTotalDist);
            var lookFromEasingArrs = this.easingCurveKnotsToArrays(lookFromEasingKnots, lookFromTotalDist);
            var P = {
                lookAtEasingT:    lookAtEasingArrs.t,
                lookAtEasingD:    lookAtEasingArrs.d,
                lookFromEasingT:  lookFromEasingArrs.t,
                lookFromEasingD:  lookFromEasingArrs.d,
                lookAtT:          lookAtT,
                lookFromT:        lookFromT,
                refLLH:           refLLH,
            }
            P = _.extend(P, this.keyframesToArrays(keyframeList));

            return P;
        },


        calculateSpline: function (keyframeList, refLLH, callback, errCallback) {
            if (keyframeList.length > 1) {
                var P = this.keyframesToArrays(keyframeList);
                $.ajax({
                    type: 'POST',
                    url: '/api/get_spline_ned',
                    data: JSON.stringify(P),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                }).then(function(data, status, xhr) {

                    if (data['T_lookAtNED'] && data['C_lookAtNED'] && data['T_lookFromNED'] && data['C_lookFromNED'] && data['dist_lookAtNED'] && data['dist_lookFromNED']) {
                        var samplesPerKeyframe = 18;

                        var lookAtSpline = {
                            coefficients: SplineUtils.Spline.pythonToJSCoefficients(data['C_lookAtNED'], keyframeList.length),
                            unsampledTvals: SplineUtils.Spline.pytonToJSParamSpacing(data['T_lookAtNED']),
                            sampledPoints: [],
                            dist: data['dist_lookAtNED'],
                        };
                        lookAtSpline.sampledPointsLLH = getSampledSpline(lookAtSpline.coefficients, lookAtSpline.unsampledTvals, refLLH, samplesPerKeyframe);

                        var cameraPoseSpline = {
                            coefficients: SplineUtils.Spline.pythonToJSCoefficients(data['C_lookFromNED'], keyframeList.length),
                            unsampledTvals: SplineUtils.Spline.pytonToJSParamSpacing(data['T_lookFromNED']),
                            sampledPoints: [],
                            dist: data['dist_lookFromNED'],
                        }
                        cameraPoseSpline.sampledPointsLLH = getSampledSpline(cameraPoseSpline.coefficients, cameraPoseSpline.unsampledTvals, refLLH, samplesPerKeyframe);

                        callback(lookAtSpline, cameraPoseSpline);

                    } else {
                        errCallback();
                    }
                });
            } else
                errCallback();
        },

        /* support for dense trajectories */
        optimizeSpline: function(lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist) {
            //STUB METHOD
            if (this.keyframeList.length > 1) {
                this.optimizedLookFromSamples = this.posSamplesListLLH;
                this.optimizedLookAtSamples = this.lookAtSamplesListLLH;
                this.optimizedTimes = this._timesForOptimizedDenseSamples(this.posSamplesListLLH.length);
                this.lastCalculatedDenseTrajectory = true;

                var optimizationData = { optimizedLookFrom: this.optimizedLookFromSamples,
                                         optimedLookAt: this.optimizedLookAtSamples,
                                         optimizedTimes: this.optimizedTimes
                                        }
                this.model.optimizeTrajectory(optimizationData);
                // var self = this;
                // var inputs; //TODO: initialize inputs here
                // $.ajax({
                //     type: 'POST',
                //     url: '/api/optimize_spline_ned',
                //     data: JSON.stringify(inputs),
                //     contentType: "application/json; charset=utf-8",
                //     dataType: "json",
                // }).then(function(data, status, xhr) {
                //      if (proper data fields are existent) {
                //         self.optimizedLookFromSamples = get optimized lookfrom spline from this data and transform it into an llh array
                //         self.optimizedLookAtSamples = get optimized lookAt spline from this data and transform it into an llh array
                //         self.optimizedTimes = _timesForOptimizedDenseSamples(get len of sample list)
                //         self.lastCalculatedDenseTrajectory = true;
                //         self.model.updateTrajectory({trajectory: self, changedIndex: 0, noScrub: false});

                        
                //     } else {
                //         notify error
                //     }
                    
                // });
    
            }
            /*stub method */
        },

        _setFeasibilityForOptimization: function(u_arrs) {
            // Models.Feasibility.set(
            // { 
            //     reparameterizedTimes: this.optimizedTimes, 
            //     feasibility:feasibility
            // });

        },

        _scaleNormalizedTvals: function(normalizedT, maxT) {
            var scaledTvals = _.map(normalizedT, function(t) {return t * maxT; });
            return scaledTvals;
        },

        /* supportForDenseTrajectories */
        _timesForOptimizedDenseSamples: function(numSamples) {
            var times = [0.0];
            var step = this.keyframeTimes[this.keyframeTimes.length-1]/numSamples;
            for (var i = 1; i < numSamples; i++) {
                var lastTime = times[i-1];
                var currentTime = lastTime + step;
                times.push(currentTime);
            }
            return times;
        },

        _scaleNormalizedTimes: function(normalizedTimes) {
            var maxTime = this.keyframeTimes[this.keyframeTimes.length-1];
            var scaledTimes = _.map(normalizedTimes, function(normTime) {return normTime * maxTime});
            return scaledTimes;
        },

        reparameterizeSpline: function (lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist) {
            if (this.keyframeList.length > 1) {
                $("#"+ENV.bg_process_spinner_selector).show();
                var self = this;

                P = this.fullTrajectoryToArrays(this.keyframeList, this.lookAtUnsampledTvals, this.posUnsampledTvals, lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist, this.refLLH);
                
                $.ajax({
                    type: 'POST',
                    url: '/api/reparameterize_spline_ned',
                    data: JSON.stringify(P),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                }).done(function(data, status, xhr) {
                    if (data['lookAtReparameterizedT'] && data['lookFromReparameterizedT']) {
                        var lookAtPyReparamT = data['lookAtReparameterizedT'];
                        var lookAtMaxT = self.lookAtUnsampledTvals[self.lookAtUnsampledTvals.length - 1];
                        self.lookAtReparamTvals = self._scaleNormalizedTvals(lookAtPyReparamT, lookAtMaxT);
                        var lookFromPyReparamT = data['lookFromReparameterizedT'];
                        var lookFromMaxT = self.posUnsampledTvals[self.posUnsampledTvals.length - 1];
                        self.posReparamTvals = self._scaleNormalizedTvals(lookFromPyReparamT, lookFromMaxT);

                        self.reparameterizedTimes = self._scaleNormalizedTimes(data['reparameterizedTime']);
                        $("#"+ENV.bg_process_spinner_selector).hide();
                        self.model.updateTrajectoryReparameterization(self);
                        ENV.clearRecoverbleError();
                    } else {
                        ENV.showRecoverableError("reparameterizeSpline", "Unrecognized data received");
                    }
                }).fail(function(xhr, status, error) {
                    ENV.showRecoverableError("reparameterizeSpline", "Invalid trajectory or easing curve. " + error);
                });
            }
        },

        exportSplineToQuadRepresentation: function(lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist) {
            if (!this.getStartAltitude()) {
                alert("We don't have a starting altitude, we cannot fly!");
                return;
            }
            if (this.keyframeList.length > 1) {
                var command = 'flyNewSpline';
                $("#"+ENV.reparam_popover_selector).show();
                var self = this;
                P = this.fullTrajectoryToArrays(this.keyframeList, this.lookAtUnsampledTvals, this.posUnsampledTvals, lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist, this.refLLH)
                P = _.extend(P, {
                    startAltitude:    this.getStartAltitude() || 0,
                    lastTime:         this.keyframeTimes[this.keyframeTimes.length-1],
                    rev:              ENV.currentRevision,
                    command:          command,
                });

                $.ajax({
                    type: 'POST',
                    url: '/api/export_spline_to_quad_representation_ned?shot=' + ENV.shotName,
                    data: JSON.stringify(P),
                    contentType: "application/json; charset=utf-8",
                    dataType: "json",
                }).done(function(data, status, xhr) {
                    ENV.showInfo("Exported! Starting to Fly!")
                }).fail(function(xhr, status, error) {
                    ENV.showRecoverableError("trajectory.js:exportSplineToQuadRepresentation()", "Failed: " + error);
                }).always(function() {
                    $("#"+ENV.bg_process_spinner_selector).hide();
                });
            } else {
                alert("We do not have keyframes to fly! Failing.")
            }



        }

	});

	return {
		Trajectory: Trajectory,
	}
});