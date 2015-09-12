define(['underscore', 'backbone', 'env', 'coord_system', 'splineutils'], function (_, Backbone, ENV, CoordSystem, SplineUtils) {

    var gEarthLoaded = false;

    var GoogleEarth = function (selector, model, success, fail) {
        this.model = model;
        google.earth.createInstance(selector, _.bind(this.onCreate, this), fail);
        this.callback = success;
    }

    var lerp2 = function(in_start, in_stop, out_start, out_stop, in_amt) {
        var amt = (in_amt - in_start)/(in_stop - in_start);
        return amt*(out_stop-out_start)+out_start;
    }

    var lerp = function(start, stop, amt) {
        return amt*(stop-start)+start;
    };

    var getLLH = function(splineCoeff, unsampledTvals, reparamTf, refLLH) {
        var X = SplineUtils.Spline.evalHermite(splineCoeff, unsampledTvals, reparamTf);
        var NED = {n: X[0], e: X[1], d: X[2]};
        var LLH = CoordSystem.ned2llh(NED, refLLH);
        return LLH;
    }

    var lookAtLookFromForCoeff = function(trajectory, currIdx, currTime, prevTime, nextTime) {
        var lookFromPrevT = trajectory.posReparamTvals[currIdx];
        var lookFromNextT = trajectory.posReparamTvals[currIdx + 1];
        var lookFromTf = lerp2(prevTime, nextTime, lookFromPrevT, lookFromNextT, currTime);
        var currPos = getLLH(trajectory.posCoeff, trajectory.posUnsampledTvals, lookFromTf, trajectory.refLLH);

        var lookAtPrevT = trajectory.lookAtReparamTvals[currIdx];
        var lookAtNextT = trajectory.lookAtReparamTvals[currIdx + 1];
        var lookAtTf = lerp2(prevTime, nextTime, lookAtPrevT, lookAtNextT, currTime);
        var currLookAt = getLLH(trajectory.lookAtCoeff, trajectory.lookAtUnsampledTvals, lookAtTf, trajectory.refLLH);

        return {
            pos: currPos,
            lookAt: currLookAt,
        };
    }

    /* support for dense trajectories */
    var lookAtLookFromForDenseSamples = function(trajectory, currIdx, currTime, prevTime, nextTime) {
        var tInterp = (currTime - prevTime) / (nextTime - prevTime)

        var prevPos = trajectory.optimizedLookFromSamples[currIdx]
        var nextPos = trajectory.optimizedLookFromSamples[currIdx + 1]

        var currPos = {
            lat: (1 - tInterp) * prevPos.lat + (tInterp) * nextPos.lat,
            lng: (1 - tInterp) * prevPos.lng + (tInterp) * nextPos.lng,
            altitude: (1 - tInterp) * prevPos.altitude + (tInterp) * nextPos.altitude,
        }

        var prevLookAt = trajectory.optimizedLookAtSamples[currIdx];
        var nextLookAt = trajectory.optimizedLookAtSamples[currIdx + 1];

        var currLookAt = {
            lat: (1 - tInterp) * prevLookAt.lat + (tInterp) * nextLookAt.lat,
            lng: (1 - tInterp) * prevLookAt.lng + (tInterp) * nextLookAt.lng,
            altitude: (1 - tInterp) * prevLookAt.altitude + (tInterp) * nextLookAt.altitude,
        }

        return {
            pos: currPos,
            lookAt: currLookAt,
        };
    }


    var updateAnimation = function (stopCallback, currentTime) {

        var timesList = this.trajectory.lastCalculatedDenseTrajectory ? this.trajectory.optimizedTimes : this.trajectory.reparameterizedTimes;
        if (currentTime == undefined)
            currentTime = this.offset + this.timer.milliseconds() / 1000.0
        this.currentTime = currentTime;

        if (this.currentTime >= timesList[timesList.length - 1]) {
            if (stopCallback)
                stopCallback();
        } else if (this.currReparamIdx + 1 < timesList.length && this.currentTime >= timesList[this.currReparamIdx + 1]) {
            while (this.currentTime >= timesList[this.currReparamIdx + 1]) 
                this.currReparamIdx++;
        }

        this.model.updateScrubBar(this.currentTime, this);

        var prevTime = timesList[this.currReparamIdx];
        var nextTime = timesList[this.currReparamIdx + 1];

        var calculateKfForTime = this.trajectory.lastCalculatedDenseTrajectory ? lookAtLookFromForDenseSamples : lookAtLookFromForCoeff;
        var currKf =  calculateKfForTime(this.trajectory, this.currReparamIdx, this.currentTime, prevTime, nextTime);
        var currPos = currKf.pos;
        var currLookAt = currKf.lookAt;

        this.currKeyFrame = _.extend(currPos, CoordSystem.llh2Euler(currPos, currLookAt));

        this.setCameraPose(this.currKeyFrame);
        this.model.setLookAt(currLookAt, this);
    }

    var decTo2CharHex = function(decimal) {
        var hexStr = Math.floor(decimal).toString(16);
        if (hexStr.length == 1) {
            hexStr = "0" + hexStr;
        }
        return hexStr;
    }

    var rgbaArrToMapColorFormat = function(rgba) {
        var hexA = decTo2CharHex(rgba[3]);
        var hexB = decTo2CharHex(rgba[2]);
        var hexG = decTo2CharHex(rgba[1]);
        var hexR = decTo2CharHex(rgba[0]);

        return hexA + hexB + hexG + hexR;
    }

    var calculateColor = function(fsum, fromColor) {
        var lerpedColor = utils.lerpColor(fromColor, [255,0,0,255], fsum);
        return rgbaArrToMapColorFormat(lerpedColor);
    }


    _.extend(GoogleEarth.prototype, Backbone.Events, {

        onCreate: function (gInstance) {
            this.gInstance = gInstance;
            this.dragging = false;
            this.onload = true;
            this.isAnim = false;
            this.timer = new Timer();
            this.currentTime = 0.0;
            this.sampledPosIdx = 0;
            this.offset = 0.0;
            this.currentT = 0;
            this.currReparamIdx = 0;
            this.lineStringPlacemark = null;
            this.lookAtTrajectoryPlacemarkArr = [];
            this.posTrajectoryPlacemarkArr = [];

            google.earth.addEventListener(this.gInstance.getView(), 'viewchange', _.bind(function () {
                this.model.setCameraPose(this.getCameraPose(), this);
                if (this.dragging) {
                    this.model.setLookAt(this.getLookAt(), this);
                }
            }, this));

            google.earth.addEventListener(this.gInstance.getView(), 'viewchangeend', _.bind(function () {
                this.model.setCameraPose(this.getCameraPose(), this);
                if (this.dragging || this.onload) {
                    this.model.setLookAt(this.getLookAt(), this);
                    this.onload = false;
                }
            }, this));

            google.earth.addEventListener(this.gInstance.getGlobe(), 'mousedown', _.bind(function () {
                this.dragging = true;
            }, this));

            google.earth.addEventListener(this.gInstance.getGlobe(), 'mouseup', _.bind(function () {
                this.dragging = false;
            }, this));

            this.model.on('change:pose', this, _.bind(function (pose) {
                this.setCameraPose(pose);
            }, this));

            this.model.on('change:lookAt', this, _.bind(function (lookAt) {
                this.setLookAt(lookAt);
            }, this));

            this.model.on('change:feasibility', this, _.bind(function(feasibilityData) {
                if (feasibilityData) {
                    this._drawLineStringForTrajectory(this.model.trajectory, feasibilityData.feasibility);
                }
            }, this));

            setTimeout(_.bind(function() {
                this.gInstance.getOptions().setFlyToSpeed(this.gInstance.SPEED_TELEPORT);
            }, this), 200);

            var playback = _.bind(updateAnimation, this);
            google.earth.addEventListener(this.gInstance, 'frameend', _.bind( function() {
                var self = this;
                if (this.isAnim) {
                    playback(function() {
                        self.isAnim = false;
                        var timesList = self.trajectory.lastCalculatedDenseTrajectory ? self.trajectory.optimizedTimes : self.trajectory.reparameterizedTimes;

                        self.currentTime = timesList[timesList.length - 1];

                        self.currReparamIdx = timesList.length - 2;

                        self.offset = 0.0;
                        self.timer.stop();
                    });
                }
            }, this));

            if (this.callback) {
                this.callback.apply(this);
            }
        },

        initializeAnimation: function (trajectory) {
            this.trajectory = trajectory;

            this.isAnim = true;
            this.currReparamIdx = 0;
            this.currentTime = 0.0;
            this.offset = 0.0;
            this.setCameraPose(this.trajectory.keyframeList[0].cameraPose);

            this.timer.start();
        },

        pauseAnimation: function () {
            this.isAnim = false;
            this.offset = this.currentTime;
            this.timer.stop();
        },

        continueAnimation: function (trajectory) {
            this.trajectory = trajectory;
            this.isAnim = true;

            if (this.offset == 0.0) {
                this.initializeAnimation(trajectory);
            } else {                
                this.setCameraPose(this.currKeyFrame);
            }
                
            this.timer.start();
        },

        makePlacemark : function(lat, lng, alt, altMode, iconStr) {  
          var icon = this.gInstance.createIcon('');
          icon.setHref('http://maps.google.com/mapfiles/kml/paddle/' + iconStr + '.png');
          
          var style = this.gInstance.createStyle('');
          style.getIconStyle().setIcon(icon);
          style.getIconStyle().getHotSpot().set(0.5, this.gInstance.UNITS_FRACTION, 0, this.gInstance.UNITS_FRACTION);
          
          var pt = this.gInstance.createPoint('');
          pt.set(lat, lng, alt, altMode, false, false);
          
          var pm = this.gInstance.createPlacemark('');
          pm.setGeometry(pt);
          pm.setStyleSelector(style);
          
          return pm;
        },

        scrubToViewAtTime: function (trajectory, scrubTime) {
            this.trajectory = trajectory;

            var self = this;
            var timesList = this.trajectory.lastCalculatedDenseTrajectory ? this.trajectory.optimizedTimes : this.trajectory.reparameterizedTimes;

            if (timesList.length > 1 && scrubTime <= timesList[timesList.length - 1]) {
                this.currentTime = 0.0;
                this.currReparamIdx = 0.0;
                this.offset = 0.0;
                var scrubToTime = _.bind(updateAnimation, this);
                scrubToTime(function() {
                    if (self.currentTime === timesList[timesList.length - 1]) {
                        self.currReparamIdx = timesList.length - 2;
                    }
                }, scrubTime);
                this.offset = scrubTime;
            }
            
        },

        setLayersVisible: function () {
            this.gInstance.getWindow().setVisibility(true)
            this.gInstance.getLayerRoot().enableLayerById(this.gInstance.LAYER_BUILDINGS, true)
            this.gInstance.getLayerRoot().enableLayerById(this.gInstance.LAYER_BUILDINGS_LOW_RESOLUTION, true)
            this.gInstance.getLayerRoot().enableLayerById(this.gInstance.LAYER_TERRAIN, true)
            this.gInstance.getLayerRoot().enableLayerById(this.gInstance.LAYER_BORDERS, true)
            this.gInstance.getLayerRoot().enableLayerById(this.gInstance.LAYER_TREES, true)
            this.gInstance.getNavigationControl().setVisibility(this.gInstance.VISIBILITY_HIDE);
        },

        showSunControl: function () {
            if (!this.gInstance.getSun().getVisibility()) {
                this.gInstance.getSun().setVisibility(true);
            }
        },

        setTour: function (name, holdPos) {
            /* supports WIDE, MEDIUM, NARROW */
            name = name || "NARROW"
            var href = "http://localhost:5000/api/get_fov.kml?GoProView=" + name;
            
            if (holdPos) {
                var pose = this.getCameraPose();
                href += "&lat=" + pose.lat;
                href += "&lng=" + pose.lng;
                href += "&altitude=" + pose.altitude;
                href += "&heading=" + pose.heading;
                href += "&tilt=" + pose.tilt;
            }
            var self = this;
            google.earth.fetchKml(this.gInstance, href, function(tour) {
                self.gInstance.getTourPlayer().setTour(tour);
                self.gInstance.getTourPlayer().getControl().setVisibility(self.gInstance.VISIBILITY_HIDE);

            });
        },

        setCameraPose: function (pose) {
            camera = this.gInstance.getView().copyAsCamera(this.gInstance.ALTITUDE_ABSOLUTE);

            camera.setLatitude(pose.lat);
            camera.setLongitude(pose.lng);
            camera.setAltitude(pose.altitude);
            camera.setHeading(pose.heading);
            camera.setTilt(pose.tilt);
            camera.setRoll(pose.roll);
//            camera.setAltitudeMode(pose.altitudeMode);

            this.gInstance.getView().setAbstractView(camera);
        },

        getCameraPose: function () {
            camera = this.gInstance.getView().copyAsCamera(this.gInstance.ALTITUDE_ABSOLUTE)

            return {
                lat: camera.getLatitude(),
                lng: camera.getLongitude(),
                altitude: camera.getAltitude(),
                heading: camera.getHeading(),
                tilt: camera.getTilt(),
                roll: camera.getRoll(),
                altitudeMode: camera.getAltitudeMode(),
            }

        },

        setLookAt: function (lookAtPos) {
            var pose = this.getCameraPose();
            var roll_pitch_yaw = CoordSystem.llh2Euler(pose, lookAtPos);
            pose = _.extend(pose, roll_pitch_yaw);
            this.setCameraPose(pose);
        },

        getLookAt: function () {
            var centerHitTestResult = this.hitTestForCenter();
            if (centerHitTestResult) {
                return {
                    lat: centerHitTestResult.getLatitude(),
                    lng: centerHitTestResult.getLongitude(),
                    altitude: centerHitTestResult.getAltitude(),
                }
            } else {
                return null;
            }
        },

        hitTestForCenter: function () {
            return this.gInstance.getView().hitTest(
                0.5,
                this.gInstance.UNITS_FRACTION,
                0.5,
                this.gInstance.UNITS_FRACTION,
                this.gInstance.HIT_TEST_BUILDINGS | this.gInstance.HIT_TEST_TERRAIN);
        },

        _drawLineStringForTrajectory: function (trajectory, feasibility) {
            if (this.posTrajectoryPlacemarkArr.length > 0) {
                for (var idx = 0; idx < this.posTrajectoryPlacemarkArr.length; idx++) {
                    this.gInstance.getFeatures().removeChild(this.posTrajectoryPlacemarkArr[idx]);
                }
            }

            if (this.lookAtTrajectoryPlacemarkArr.length > 0) {
                for (var idx = 0; idx < this.lookAtTrajectoryPlacemarkArr.length; idx++) {
                    this.gInstance.getFeatures().removeChild(this.lookAtTrajectoryPlacemarkArr[idx]);
                }
            }

            if (trajectory.reparameterizedTimes.length > 1) { //trajectory.reparameterizedTimes
                this._drawLineStringForSpline(trajectory, feasibility, this.posTrajectoryPlacemarkArr, [0, 255, 0, 255], false);
                this._drawLineStringForSpline(trajectory, feasibility, this.lookAtTrajectoryPlacemarkArr, [0, 0, 255, 255], true);                
            }
        },

        /* support for dense trajectories */
        _drawLineStringForSpline: function(trajectory, feasibility, lineStringList, colorArr, isLookAt) {
            var splineCoeff = isLookAt ? trajectory.lookAtCoeff : trajectory.posCoeff;
            var unsampledTvals = isLookAt ? trajectory.lookAtUnsampledTvals : trajectory.posUnsampledTvals;
            var reparamTvals = isLookAt ? trajectory.lookAtReparamTvals : trajectory.posReparamTvals;
            var optimizedSamples = isLookAt ? trajectory.optimizedLookAtSamples : trajectory.optimizedLookFromSamples;

            var len = trajectory.lastCalculatedDenseTrajectory ? optimizedSamples.length : trajectory.reparameterizedTimes.length;
            for (var i = 0; i < len - 1; i++) {
                var lineStringPlacemark = this.gInstance.createPlacemark('');
                lineStringPlacemark.setStyleSelector(this.gInstance.createStyle(''));

                var lineStyle = lineStringPlacemark.getStyleSelector().getLineStyle(); //
                lineStyle.setWidth(2);

                var f = feasibility[i];
                color = f ? calculateColor(f.sum, colorArr) : rgbaArrToMapColorFormat(colorArr);
                lineStyle.getColor().set(color);  // aabbggrr format change this
                
                var polyStyle = lineStringPlacemark.getStyleSelector().getPolyStyle();
                polyStyle.setFill(0);

                var lineString = this.gInstance.createLineString('');
                lineString.setExtrude(true);
                lineString.setAltitudeMode(this.gInstance.ALTITUDE_ABSOLUTE);
                lineStringPlacemark.setGeometry(lineString);

                var start = trajectory.lastCalculatedDenseTrajectory ? optimizedSamples[i] : getLLH(splineCoeff, unsampledTvals, reparamTvals[i], trajectory.refLLH);
                var end = trajectory.lastCalculatedDenseTrajectory ? optimizedSamples[i + 1] : getLLH(splineCoeff, unsampledTvals, reparamTvals[i + 1], trajectory.refLLH);

                lineString.getCoordinates().pushLatLngAlt(start.lat, start.lng, start.altitude);
                lineString.getCoordinates().pushLatLngAlt(end.lat, end.lng, end.altitude);

                this.gInstance.getFeatures().appendChild(lineStringPlacemark); 

                lineStringList.push(lineStringPlacemark);
            }



        },

    });

    return {

        init: function (callback) {
            if (!gEarthLoaded) {
                console.log("LOADING GOOGLE EARTH");
                google.load("earth", "1", {
                    'callback': function () {
                        console.log("GOOGLE EARTH LOADED");
                        gEarthLoaded = true;
                        !callback || callback();
                    }
                });
            }

        },

        GoogleEarth: GoogleEarth
    };
})