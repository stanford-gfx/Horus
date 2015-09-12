define(['underscore', 'backbone', 'utils', 'env', 'splineutils', 'coord_system', 'models'], function (_, Backbone, utils, ENV, SplineUtils, CoordSystem, Models) {

    //Move these to ENV:
    var defaultOptions = {
        disableDefaultUI: true,
        zoomControl: true,
        scaleControl: true,
        mapTypeControl: true,
        panControl: true,
        mapTypeId: google.maps.MapTypeId.SATELLITE,
        tilt: 0     
    }

    var cameraImage = {
        url: '/static/img/camera6.png',
        size: new google.maps.Size(32,20),
        origin: new google.maps.Point(0,0),
        anchor: new google.maps.Point(11,10),
        rotation: 30,
    }

    var cameraSymbol = {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        rotation: 30,
        scale:6,
        strokeColor: 'yellow',
        fillColor: 'white',
        fillOpacity: 1,
        strokeOpacity: 0,
    }

    var keyFrameSymbol = {
        path: google.maps.SymbolPath.FORWARD_OPEN_ARROW,
        rotation: 30,
        scale:6,
        strokeColor: 'yellow',
        fillColor: 'red',
        fillOpacity: 1,
        strokeOpacity: 0,
    }

    var dashedLineSymbol = {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeWeight: 2,
        scale: 4
    }

    var getLLH = function(splineCoeff, unsampledTvals, reparamTf, refLLH) {
        var X = SplineUtils.Spline.evalHermite(splineCoeff, unsampledTvals, reparamTf);
        var NED = {n: X[0], e: X[1], d: X[2]};
        var LLH = CoordSystem.ned2llh(NED, refLLH);
        return LLH;
    }

    // note: alpha value must be on a 255 max scale
    var arrToRGBAStr = function(rgba) {
        return 'rgba(' + Math.round(rgba[0]) + ', ' + Math.round(rgba[1]) + ', ' + Math.round(rgba[2]) + ', ' + (rgba[3]/255) + ')';
    }

    // takes fromColor in the form of an rgba array and returns an html rgba color string
    var calculateColor = function(fsum, fromColor) {
        var lerpedColor = utils.lerpColor(fromColor, [255,0,0,255], fsum);
        return arrToRGBAStr(lerpedColor);
    }

    /* support for dense trajectories */
    var drawPathForSpline = function(self, trajectory, feasibilityData, pathLinesList, colorArr, isLookAt) { //change
        var splineCoeff = isLookAt ? trajectory.lookAtCoeff : trajectory.posCoeff;
        var unsampledTvals = isLookAt ? trajectory.lookAtUnsampledTvals : trajectory.posUnsampledTvals;
        var reparamTvals = isLookAt ? trajectory.lookAtReparamTvals : trajectory.posReparamTvals;
        var optimizedSamples = isLookAt ? trajectory.optimizedLookAtSamples : trajectory.optimizedLookFromSamples;

        var lastLLH = trajectory.lastCalculatedDenseTrajectory ? optimizedSamples[0] : getLLH(splineCoeff, unsampledTvals, reparamTvals[0], trajectory.refLLH);
        var len = trajectory.lastCalculatedDenseTrajectory ? optimizedSamples.length : trajectory.reparameterizedTimes.length;

        for (var idx = 1; idx < len; idx++) {
            var currLLH = trajectory.lastCalculatedDenseTrajectory ? optimizedSamples[idx] : getLLH(splineCoeff, unsampledTvals, reparamTvals[idx], trajectory.refLLH);

            var color = arrToRGBAStr([0,0,0,255]);
            if (feasibilityData) {
                var f = feasibilityData.feasibility[idx];
                color = f ? calculateColor(f.sum, colorArr) : arrToRGBAStr(colorArr);
            }
            // calculate color
            if (pathLinesList[idx - 1]) {
                var currLatLng = new google.maps.LatLng(currLLH.lat, currLLH.lng);
                var lastLatLng = new google.maps.LatLng(lastLLH.lat, lastLLH.lng);
                pathLinesList[idx-1].setOptions({
                    path: [lastLatLng, currLatLng],
                    geodesic: true,
                    strokeColor: color,
                    strokeWeight: 2
                });
                //set color
                pathLinesList[idx-1].setMap(self.gInstance);

            } else {
                pathLinesList.push(self.drawPathLine(lastLLH, currLLH, {color: color}));
            }

            lastLLH = currLLH;
        }

        if (pathLinesList.length > len) {
            for (var j = len; j < pathLinesList.length; j++) {
                pathLinesList[j].setMap(null);
            }
        }
    }

    var drawSpline = function(self, trajectory, feasibilityData, markersList, pathLinesList, color, isLookAt) {
        var keyframeList = trajectory.keyframeList;
        for (var i = 0; i < keyframeList.length; i++) {
            var pose = isLookAt ? keyframeList[i].lookAt : keyframeList[i].cameraPose;
            if (markersList[i]) { 
                var marker = markersList[i];
                if (marker.getPosition().lat() != pose.lat || marker.getPosition().lng() != pose.lng)
                    marker.setPosition(new google.maps.LatLng(pose.lat, pose.lng));
                marker.setMap(self.gInstance);
            } else {
                markersList[i] = self.createKeyframeMarker(pose.lat, pose.lng, i, isLookAt, keyframeList);
            }
        }

        if (markersList.length > keyframeList.length) {
            for (var j = keyframeList.length; j < markersList.length; j++) {
                markersList[j].setMap(null);
            }
        }

        drawPathForSpline(self, trajectory, feasibilityData, pathLinesList, color, isLookAt); //what to pass into here; pass in islookat and trajectory
    }

    /* Constructor */
    var GoogleMaps = function(selector, model, options) {
        this.model = model;
        this.gInstance = new google.maps.Map(document.getElementById(selector), _.extend(options, defaultOptions));
        this.gElevation  = new google.maps.ElevationService();
        this.setupEvents(arguments);
        this.createQuadMarker();
        this.createCameraMarker();
        this.createLookAtMarker();
        this.createStartMarker();
        this.lookAtMarkers = [];
        this.lookFromMarkers = [];
        this.currSelectedIndex = -1;
        this.editPathLines = [];
        this.cameraPosPaths = [];
        this.lookAtPaths = [];
        this.lookAtPySplinePaths = [];
        this.cameraPosPySplinePaths = [];
    };

    /* Class-level functions */
    _.extend(GoogleMaps.prototype, Backbone.Events, {

        setupEvents: function() {
            var a = this;

            this.model.on('change:pose', this, _.bind(function(pose) {
                this.setCameraPose(pose);
            }, this))
            //bind to a change in the lookat point
            this.model.on('change:lookAt', this, _.bind(function(lookAt) {
                this.setLookAt(lookAt);
            }, this))

            Models.Feasibility.on('change:feasibility', this, _.bind(function(feasibilityData) {
                this.drawKeyframeList(this.model.trajectory, feasibilityData);
            }, this))
        },
 
        drawKeyframeList: function(trajectory, feasibilityData) {
            drawSpline(this, trajectory, feasibilityData, this.lookFromMarkers, this.cameraPosPaths, [0,255,0,255], false); //change to take in the trajectory
            drawSpline(this, trajectory, feasibilityData, this.lookAtMarkers, this.lookAtPaths, [0,0,255,255], true); //change to take in just the trajectory

        },

        createQuadMarker: function() {

            // this.quadMarker = new google.maps.Marker({
            //     position: this.gInstance.getCenter(),
            //     title: "Quad",
            //     draggable: false,
            //     icon: cameraImage,
            //     map: this.gInstance,
            // });

        },

        removeSelectedKeyframe: function() {
            if (this.currSelectedIndex >= 0) {
                this.model.trajectory.removeKeyframeAtIndex(this.currSelectedIndex);                
                this.setSelectedMarkersToNull();
            } else {
                alert("Please select a keyframe marker on Google Maps to remove the keyframe.");
            }
        },

        revertEditedKeyframe: function() {
            if (this.currSelectedIndex >= 0) {
                var keyframe = this.model.trajectory.keyframeList[this.currSelectedIndex];
                this.lookFromMarkers[this.currSelectedIndex].setPosition({ lat: keyframe.cameraPose.lat, lng: keyframe.cameraPose.lng });
                this.lookAtMarkers[this.currSelectedIndex].setPosition({lat: keyframe.lookAt.lat, lng: keyframe.lookAt.lng });

                this.setSelectedMarkersToNull();
            }
        },

        saveEditedKeyframe: function() {
            if (this.currSelectedIndex >= 0) {
                this.model.trajectory.modifyKeyframeAtIndex(this.currSelectedIndex, true);
                this.setSelectedMarkersToNull();
            }
        },

        createKeyframeMarker: function(lat, lng, index, isLookAt) {
            var keyframeList = this.model.trajectory.keyframeList;
            var keyframeTimes = this.model.trajectory.keyframeTimes;
            var startingPos = new google.maps.LatLng(lat, lng);
            var icon = isLookAt ? "http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/eye-plus-icon.png" : "http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/camera-plus-icon.png";
            var editIcon = isLookAt ? "http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/eye-pencil-icon.png" : "http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/camera-pencil-icon.png";
            var title = isLookAt ? "LookAtMarker" : "LookFromMarker";
            var otherMarkerList = isLookAt ? this.lookFromMarkers : this.lookAtMarkers;
            var otherIcon = !isLookAt ? "http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/eye-pencil-icon.png" : "http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/camera-pencil-icon.png";

            var keyframeMarker = new google.maps.Marker({
                position: startingPos,
                title: title,
                draggable: false,
                clickable: true,
                icon: icon,
                map: this.gInstance,
            });           

            google.maps.event.addListener(keyframeMarker, 'click', _.bind(function() {
                var prevSelectedIndex  = this.currSelectedIndex;
                this.saveEditedKeyframe();

                if (prevSelectedIndex !== index) {
                    keyframeMarker.setDraggable(true);
                    keyframeMarker.setIcon(editIcon);

                    otherMarkerList[index].setDraggable(true);
                    otherMarkerList[index].setIcon(otherIcon);

                    this.currSelectedIndex = index;
                    this.model.setLookAt(keyframeList[index].lookAt, this);
                    this.model.setCameraPose(keyframeList[index].cameraPose, this);
                    this.model.updateScrubBar(keyframeTimes[index], this);
                }
            }, this));

            google.maps.event.addListener(keyframeMarker, 'drag', _.bind(function() {
                var pos = keyframeMarker.getPosition();
                if (isLookAt)
                    this.model.setLookAt({ lat:pos.lat(), lng:pos.lng() }, this);
                else
                    this.model.setCameraPose({ lat:pos.lat(), lng:pos.lng() }, this);
            }, this));
            return keyframeMarker;
            
        },

        getAltitudeForLatLng: function(lat, lng, callback) {
            console.log(lat, lng);
            var latLng = {lat: lat, lng: lng};
//            var latLng = new google.maps.LatLng(lat, lng);
            var positionalRequest = {'locations': [latLng]};
            this.gElevation.getElevationForLocations(positionalRequest, function(results, status) {
                console.log("RESULTS:", results)
                if (status == google.maps.ElevationStatus.OK && results.length == 1) {
                    callback(results[0].elevation);
                    ENV.clearRecoverbleError();
                } else {
                    ENV.showRecoverableError("getAltitudeForLatLng", "Request returned with failed status");
                    callback(null);
                }
            });
        },

        setSelectedMarkersToNull: function() {
            if (this.currSelectedIndex >= 0) {
                var lookFromMarker = this.lookFromMarkers[this.currSelectedIndex]; 
                lookFromMarker.setIcon("http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/camera-plus-icon.png");
                lookFromMarker.setDraggable(false);

                var lookAtMarker = this.lookAtMarkers[this.currSelectedIndex];
                lookAtMarker.setIcon("http://icons.iconarchive.com/icons/yusuke-kamiyamane/fugue/16/eye-plus-icon.png");
                lookAtMarker.setDraggable(false);

                this.currSelectedIndex = -1;
            }
        },

        createStartMarker: function() {
            this.startMarker = new google.maps.Marker({
                title: "Quad Starting Position",
                draggable: false,
                icon: 'http://icons.iconarchive.com/icons/oxygen-icons.org/oxygen/24/Actions-flag-red-icon.png',
            })
            this.vehicleMarker = new google.maps.Marker({
                title: "Current Quad Position",
                draggable: false,
                icon: 'http://icons.iconarchive.com/icons/mad-science/arcade-saturdays/32/Drones-icon.png',
            })
        },

        createCameraMarker: function() {

            this.cameraMarker = new google.maps.Marker({
                position: this.gInstance.getCenter(),
                title: "Virtual Camera",
                draggable: true,
                icon: cameraSymbol,
                map: this.gInstance,
                zIndex: 0,
            });

            google.maps.event.addListener(this.cameraMarker, 'drag', _.bind(function() {
                var pos = this.cameraMarker.getPosition();
                this.model.setCameraPose({ lat:pos.lat(), lng:pos.lng() }, this);
            }, this));

        },

        createLookAtMarker: function() {
            var startingPos = new google.maps.LatLng(0, 0);
            var crosshair = {
                url: 'http://www.daftlogic.com/images/cross-hairs.gif',
                size: new google.maps.Size(19, 19),
                origin: new google.maps.Point(0,0),
                anchor: new google.maps.Point(9.5, 9.5)
            };
            this.lookAtMarker = new google.maps.Marker({
                position: startingPos,
                title: "LookAt Marker",
                draggable: true,
                icon: crosshair,
                map: this.gInstance,
                zIndex: 0,
            });

            google.maps.event.addListener(this.lookAtMarker, 'drag', _.bind(function() {
                var pos = this.lookAtMarker.getPosition();
                this.model.setLookAt({ lat:pos.lat(), lng:pos.lng() }, this);
            }, this));
        },

        clearPathLines: function() {
            for (var i = 0; i < this.keyframeSplinePaths.length; i ++) {
                this.keyframeSplinePaths[i].setMap(null);
            }

            for (var i = 0; i < this.keyframePaths.length; i ++) {
                this.keyframePaths[i].setMap(null);
            }

        },

        drawPathLine: function(start, end, options) {
            //todo: NED->LLH
            options = options || {};
            var opacity = options.opacity != undefined ? options.opacity : 1.0;
            var flightPlanCoordinates = [
                new google.maps.LatLng(start.lat, start.lng),
                new google.maps.LatLng(end.lat, end.lng)
            ];
            var flightPath = new google.maps.Polyline({
                path: flightPlanCoordinates,
                geodesic: true,
                icons: options.icon || undefined,
                strokeColor: options.color || "#000000",
                strokeOpacity: opacity,
                strokeWeight: 2
            });

            flightPath.setMap(this.gInstance);
            return flightPath;
        },

        setMapCenter: function(center, instant) {
            if (instant)
                this.gInstance.setCenter(center);
            else
                this.gInstance.panTo(center);
        },

        setCameraPose: function(pose) {
            this.cameraMarker.setPosition({ lat: pose.lat, lng: pose.lng });
            icon = this.cameraMarker.getIcon()
            icon.rotation = pose.heading;
            this.cameraMarker.setIcon(icon);
            if (this.currSelectedIndex >= 0) {
                this.lookFromMarkers[this.currSelectedIndex].setPosition({ lat: pose.lat, lng: pose.lng });
            }
        },

        setLookAt: function(lookAt) {
            this.lookAtMarker.setPosition({ lat: lookAt.lat, lng: lookAt.lng });
            if (this.currSelectedIndex >= 0) {
                this.lookAtMarkers[this.currSelectedIndex].setPosition({lat: lookAt.lat, lng: lookAt.lng });
            }
        },

        setStartLocation: function(lat, lng) {
            this.startMarker.setPosition({ lat: lat, lng: lng});
            this.startMarker.setMap(this.gInstance);
        },

        hideStartMarker: function() {
            this.startMarker.setMap(null);
        },

        setCurrentLocation: function(lat, lng) {
            this.vehicleMarker.setPosition({ lat: lat, lng: lng});
            this.vehicleMarker.setMap(this.gInstance);
        },

        hideCurrentMarker: function() {
            this.vehicleMarker.setMap(null);
        },

    });

    return {
        GoogleMaps: GoogleMaps,
    }

});