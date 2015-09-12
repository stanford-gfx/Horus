define(['env', 
        'jquery-ui', 
        'jquery', 
        'underscore', 
        'backbone', 
        'PubSub', 
        'gEarth', 
        'gMaps', 
        'models', 
        'coord_system', 
        'shots', 
        'dataflash', 
        'trajectory',
        'easingcurve',
        'splineutils',
        'feasibilityplot',
        'feasibility',
        'setAspectRatio',
        'utils'],

        function(
            ENV, 
            $, 
            $, 
            _, 
            Backbone, 
            PubSub, 
            gEarth, 
            gMaps, 
            Models, 
            CoordSystem, 
            Shots, 
            Dataflash, 
            Trajectory,
            EasingCurve,
            SplineUtils,
            FeasibilityPlot,
            Feasibility,
            AspectRatio,
            Utils) {


    //Global components:
    var gCameraView;
    var gGodView;
    var lookFromEasingCurveView;
    var lookAtEasingCurveView;
    var loadedShot = false;
    var trajectory;
    var keyframeTimes;
    var currentKfIndex = 0;

    //var currtime = 60; //current duration of shot

    var feasibilityManager;

    var poseTemplateString = "<p>Lat: <%= lat %></br>"
    poseTemplateString += "Lon: <%= lng %></br>"
    poseTemplateString += "Alt: <%= altitude %></br>"
    poseTemplateString += "</p>"

    var poseTemplate = _.template(poseTemplateString);

    var hidePopover = function() {
        $("#"+ENV.popover_selector).hide();
    }

    var messageInPopover = function(msgHTML) {
        $("#"+ENV.popover_selector).show();
        $("#"+ENV.popover_message_selector).html(msgHTML);

    }

    // Read a page's GET URL variables and return them as an associative array.
    var getUrlVars = function() {
        var vars = [], hash;
        var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
        for(var i = 0; i < hashes.length; i++)
        {
            hash = hashes[i].split('=');
            vars.push(hash[0]);
            vars[hash[0]] = hash[1];
        }
        return vars;
    }

    var renderKeyframes = function() {
        var el = document.getElementById(ENV.data_selector);
        el.innerHTML = "Number of keyframes " + trajectory.keyframeList.length;
    };

    var renderLogPositions = function(positions) {
        if (positions.length > 1 && positions) {
            for (var i = 1; i < positions.length; i++) {
                gGodView.drawPathLine(positions[i-1].cameraPose, positions[i].cameraPose, {color:'#0000FF'});
            }
        }
    };

    var saveShot = function(autosave) { //should take bool for auto or manual save
        
        var enteredShotname = document.getElementById(ENV.shotname_selector).value;
        if (!enteredShotname) {
            alert('No shotname entered');
            return; 
        }
        if (!ENV.shotName) {
            ENV.shotName = enteredShotname;
            window.history.pushState("", "", "/edit_shot?shot=" + ENV.shotName);

        } else if (ENV.shotName != enteredShotname) {
            alert('You cannot currently change shot names. Edit the file on disk.');
            document.getElementById(ENV.shotname_selector).value = ENV.shotName;
            return
        }

        //get camera properties from DOM
        //maybe better idea to save state to ENV on any change in DOM?
        var quad = $('#quadProperties').val();
        var lens = $('input[name="FOV"]:checked').val();
        var ratio = $('input[name="r"]:checked').val();

        //add save type, save time, open tab etc in logging info object
        var open_tab = $("#right_tabcontainer div:not(.tab_invisible)").html();
        var logging_info = {
            open_tab: open_tab,
            date: Date(),
            autosave: autosave,
            prevRevision: ENV.currentRevision
        };

        $.ajax({
            type: 'POST',
            url: '/api/set_shot',
            contentType: "application/json; charset=utf-8",
            dataType: 'json',
            data: JSON.stringify({
                shotName: ENV.shotName,
                totalTimeMs: trajectory.totalTime*1000,
                keyFrameList: trajectory.keyframeList,
                keyframeTimes: trajectory.keyframeTimes,
                refLLH: trajectory.refLLH,
                lookFromCurve: lookFromEasingCurveView.getState(),
                lookAtCurve: lookAtEasingCurveView.getState(),
                quadProps: quad,
                lensProps: lens,
                aspectRatio: ratio,
                logging: logging_info,
            })
        }).done(function() {
            ENV.showInfo("Shot saved.");
            ENV.revisionCount += 1;
            ENV.currentRevision = ENV.revisionCount;
            updateRevisionDisplay();
        }).fail(function() {
            ENV.showRecoverableError("app.js:saveShot()", "Failed to save");
        })

    };

    var startAutoSaving = function() {
        setInterval(function() {
            console.log("autosaving!", Date());
            saveShot(true); //true for auto save
        }, ENV.autosave_every_ms);
    };

    var insertKeyframe = function() {
        var time = $('#scrub_control').slider("option", "value")/1000;
        if (time === trajectory.keyframeTimes[currentKfIndex]) {
            var kf_time = msToMinSecStr($('#scrub_control').slider("option", "value"));
            var kf_save = confirm("Save changes made to keyframe " + currentKfIndex + " at time "+ kf_time +" ?");
            if (kf_save) {
                console.log("overwriting new keyframe!");
                var time = $('#scrub_control').slider("option", "value")/1000;
                trajectory.insertKeyframe(time);
                renderKeyframes();
            } // else don't save
        } else {
            trajectory.insertKeyframe(time);
            renderKeyframes();
        }
    };

    var removeKeyframe = function() {
        if (gGodView) {
            console.log("remove frame clicked!");
            gGodView.removeSelectedKeyframe();
            renderKeyframes();
        }
    }

    var saveEditedKeyframe = function() {
        if (gGodView)
            gGodView.saveEditedKeyframe();
    }

    var cancelKeyframeEditting = function() {
        if (gGodView)
            gGodView.revertEditedKeyframe();
    }

 /* TODO: EDIT THIS */
    var playback = function() {
        if (gGodView)
            gGodView.setSelectedMarkersToNull();
        if (trajectory.keyframeList.length > 1) {
            document.getElementById('scrub_pp_button').innerHTML = "Pause";
            gCameraView.initializeAnimation(trajectory);
        }
    }

    var togglePlayback = function() {
        if (trajectory.keyframeList.length > 1) {
            if (gCameraView.isAnim) {
                gCameraView.pauseAnimation();
                document.getElementById('scrub_pp_button').innerHTML = "Play"
            }
            else if (gGodView.currSelectedIndex === -1 || gGodView.currSelectedIndex == null){
                gCameraView.continueAnimation(trajectory);
                document.getElementById('scrub_pp_button').innerHTML = "Pause"
            }
        }
    }

    var playback_log = function() {
        if (Dataflash.hasLog()) {
            gCameraView.initializeAnimation(Dataflash.getKeyframeList(), Dataflash.getTimeList());            
        }
    }

    var addCirclestrafe = function() {
        trajectory.appendKeyframes(Shots.getCircleStrafeKeyframes(
                _.clone(CameraViewModel.lookAt),
                _.clone(CameraViewModel.pose)));
        renderKeyframes();  
    }

    var download = function(filename, text) {
        var pom = document.createElement('a');
        pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + text);
        pom.setAttribute('download', filename);
        pom.click();
    };


    var scrubToPrevKeyframe = function() {
        var currentTime = $('#scrub_control').slider("option", "value") / 1000;
        if (currentTime > trajectory.keyframeTimes[currentKfIndex]) {
            gCameraView.scrubToViewAtTime(trajectory, trajectory.keyframeTimes[currentKfIndex]);
        } else {
            if (currentKfIndex - 1 >= 0) {
                gCameraView.scrubToViewAtTime(trajectory, trajectory.keyframeTimes[currentKfIndex - 1]);
            }
        }
    };

    var scrubToNextKeyframe = function() {
        if (currentKfIndex + 1 < trajectory.keyframeTimes.length) {
            gCameraView.scrubToViewAtTime(trajectory, trajectory.keyframeTimes[currentKfIndex + 1]);
        } 
    };

    var showSunControl = function() {
        gCameraView.showSunControl();
    }

    var setPosFromTxtbox = function(selector, posName, coordName, val) {
        var numVal = parseFloat(val);
        if (isNaN(numVal)) {
            $("#" + selector).css({"background-color": "red"});
        } else {
            $("#" + selector).css({});
            var pos = {};
            pos[coordName] = numVal;
            if (posName == "lookAt") {
                CameraViewModel.setLookAt(pos, this);
            } else {
                CameraViewModel.setCameraPose(pos, this);
            }
        }
    }

    var windowResize = function(e) {
        console.log('windowResize called.');
        var $bigbottom = $("#ll_bigbottom");
        var bbwidth = $bigbottom.width() / 2 - 2;
        var bbheight = $bigbottom.height();

        lookFromEasingCurveView.resize(bbwidth, bbheight);
        lookAtEasingCurveView.resize(bbwidth, bbheight);

        var outer = $('#ll_bigtop_left_contents');
        var inner = $('#g_camera_view_container');

        AspectRatio.resizeDiv(inner, outer, ENV.godViewHeightRatio, ENV.godViewWidthRatio);
    }

    var alertNameIsFree = function() {
        //alert("Selected name is free. Please proceed.");
        //remove popover and start autosave
        startAutoSaving();
        hidePopover();  
    }

    var isNameAvailable = function(name, callback) {
        var params = {name:name};
        $.ajax({
            type: 'GET',
            url: '/api/is_name_available?' + $.param(params),
            contentType: "application/json; charset=utf-8",
            dataType: "json",

        }).done(function(data, status, xhr) {
            console.log(data);
            if(!data["valid"]) {
                name = null;
                while (name == null) {
                    name = prompt("Name is taken. Please give your shot a name.");
                }
                isNameAvailable(name, alertNameIsFree);
            } else {
                document.getElementById(ENV.shotname_selector).value = name;
                callback();
            }
            return data["valid"];
        }).fail(function() {
            ENV.showRecoverableError("app.js:getShotName()", "Failed to save");
        });
    }

    var getShotName = function() {
        //may need additional validations
        var name = null;
        while (name == null) {
            name = prompt("Please give your shot a name.");
        }

        var valid = isNameAvailable(name, alertNameIsFree);
        document.getElementById(ENV.shotname_selector).value = name;
    }

    var getInitialDuration = function (){
        var duration = null;
        while ((duration == null) || !Utils.isNum(duration) || Number(duration) <= 0) {
            var duration = prompt("Please enter your desired shot duration in seconds.", trajectory.totalTime);
       }

        setDuration(duration*1000, false);
    }

    var changeDurationFromInspector = function () {
        var minutes = $("#minutes").val();
        var seconds = $('#seconds').val();

        if(!Utils.isNum(minutes) || !Utils.isNum(seconds)){
            alert("Enter a whole number.");
            return;
        }

        if (parseInt(seconds) < 0 || parseInt(seconds) > 59) {
            alert("Seconds must be between 0 and 59");
            return;
        }

        var durInSec = parseInt(seconds) + parseInt(minutes) * 60;

        //get value from radio buttons
        var shoulScale;
        if ($('input[name="scale"]:checked').val() === "true") {
            shouldScale = true;
        } else if ($('input[name="scale"]:checked').val() === "false") {
            shouldScale = false;
        } else {
            alert("Please select scaling or no scaling.");
            return;
        }

        if (durInSec > 0) {
            if (!shouldScale && trajectory.keyframeTimes.length > 0 
                && durInSec < trajectory.keyframeTimes[trajectory.keyframeTimes.length - 1]) {
                alert("You cannot contract the duration past the time of the last keyframe.");
            } else {
                setDuration(durInSec*1000, shouldScale);
                $('input[name=scale]').attr('checked',false);
            }
        } else {
            alert("The total duration must be greater than 0.")
        }
    }

    var setupDOMEvents = function() {
            $("#recoverable_error_message").hide();
            $("#info_message").hide();

            $("#btn_save").click(function() {
                saveShot(false);
            }); //saveShot(false) for manual save

            $("#btn_playback").click(playback);

            // $("#btn_playback_log").click(playback_log);

            // $("#btn_add_circlestrafe").click(addCirclestrafe);

            $("#relalt").click(renderKeyframes);

            $("#update_duration_button").click(function(){
                changeDurationFromInspector();
            });

            $("#fov_narrow").click(function() {
                gCameraView.setTour('NARROW', true);
            })
            $("#fov_medium").click(function() {
                gCameraView.setTour('MEDIUM', true);
            })
            $("#fov_wide").click(function() {
                gCameraView.setTour('WIDE', true);
            })

            $("#btn_calc_feasibility").click(function() {
                if (feasibilityManager && trajectory && lookAtEasingCurveView && lookFromEasingCurveView) {
                    feasibilityManager.calculateFeasibility(trajectory, lookAtEasingCurveView.getCurveKnots(), lookAtEasingCurveView.totalDist, lookFromEasingCurveView.getCurveKnots(), lookFromEasingCurveView.totalDist);
                }
            });

            $("#btn_recalc").click(function() {
                trajectory.notifyChange(0,false);
            });

            $("#btn_optimize").click(function() {
                var lookAtTotalDist = lookAtEasingCurveView.totalDist;
                var lookFromTotalDist = lookFromEasingCurveView.totalDist;
                trajectory.optimizeSpline(lookAtEasingCurveView.getCurveKnots(), lookAtTotalDist, lookFromEasingCurveView.getCurveKnots(), lookFromTotalDist);
            });

            $("#btn_export_spline").click(function() {
                var lookAtTotalDist = lookAtEasingCurveView.totalDist;
                var lookFromTotalDist = lookFromEasingCurveView.totalDist;
                trajectory.exportSplineToQuadRepresentation(lookAtEasingCurveView.getCurveKnots(), lookAtTotalDist, lookFromEasingCurveView.getCurveKnots(), lookFromTotalDist);
            });

            $('#btn_add_kf').click(insertKeyframe);

            $('#btn_del_kf').click(removeKeyframe);

            $('#btn_save_kf').click(saveEditedKeyframe);

            $('#btn_undo_kf').click(cancelKeyframeEditting);

            $('#next_kf_button').click(scrubToNextKeyframe);

            $('#prev_kf_button').click(scrubToPrevKeyframe);

            $('#btn_sun').click(showSunControl);

            document.getElementsByTagName("body")[0].addEventListener('keypress', function (e) {
                console.log("BODY BUTTON PRESS", e.keyCode);
                if (e.keyCode == 115) {
                    if (gGodView && gGodView.currSelectedIndex >= 0) {
                        saveEditedKeyframe();
                    } else {
                        insertKeyframe();
                    }               
                } else if (e.keyCode == 32) {
                    e.preventDefault();

                    togglePlayback();
                } else if (e.keyCode == 100) {
                    removeKeyframe();
                } else if (e.keyCode == 99) {
                    cancelKeyframeEditting();
                }
                renderKeyframes();

            }, true);

            document.getElementById('scrub_pp_button').addEventListener("click", function() {
                togglePlayback();
            });

            $('#scrub_control').on("slide", function (event, ui) {
                if (gCameraView) {
                    gCameraView.scrubToViewAtTime(trajectory, ui.value/1000);
                }
                if (gGodView) {
                    gGodView.setSelectedMarkersToNull();
                }
                if (ui.value >= 0)
                    $('#scrub_progress').text(msToMinSecStr(ui.value));
            });

            $('#scrub_control').on("slidechange", function (event, ui) {
                if (ui.value >= 0) {
                    $('#scrub_progress').text(msToMinSecStr(ui.value));
                }
            });

            $('#scrub_control').on("click", function () {
                console.log("srub control clicked");
            });

            $('#la_lat').keypress(function(e) {
                if (e.keyCode == 13) {
                    setPosFromTxtbox('la_lat', 'lookAt', 'lat', $(this).val());
                }
            });

            $('#la_lng').keypress(function(e) {
                if (e.keyCode == 13) {
                    setPosFromTxtbox('la_lng', 'lookAt', 'lng', $(this).val());
                }
            });

            $('#la_alt').keypress(function(e) {
                if (e.keyCode == 13) {
                    setPosFromTxtbox('la_alt', 'lookAt', 'altitude', $(this).val());
                }
            });

            $('#lf_lat').keypress(function(e) {
                if (e.keyCode == 13) {
                    setPosFromTxtbox('lf_lat', 'lookFrom', 'lat', $(this).val());
                }
            });

            $('#lf_lng').keypress(function(e) {
                if (e.keyCode == 13) {
                    setPosFromTxtbox('lf_lng', 'lookFrom', 'lng', $(this).val());
                }
            });

            $('#lf_alt').keypress(function(e) {
                if (e.keyCode == 13) {
                    setPosFromTxtbox('lf_alt', 'lookFrom', 'altitude', $(this).val());
                }
            });

            $(window).resize(function(e) {
                windowResize(e);
            });

            //set up radio button event listeners
            $("#ratio16-9").click(function() {
                ENV.godViewWidthRatio  = 16;
                ENV.godViewHeightRatio = 9;
                windowResize();
            });

            $("#ratio4-3").click(function() {
                ENV.godViewWidthRatio  = 4;
                ENV.godViewHeightRatio = 3;
                windowResize();
            });

            var interact_with_tabs = function(visibleTab) {
                var invisibleTab = (visibleTab == "feasibility") ? "inspector" : "feasibility";
                $("#section_" + invisibleTab).hide();
                $("#section_" + visibleTab).show();

                $("#tab_" + invisibleTab).addClass("tab_invisible");
                $("#tab_" + visibleTab).removeClass("tab_invisible");

            }

            $("#tab_inspector").click(function() { interact_with_tabs("inspector"); });
            $("#tab_feasibility").click(function() { interact_with_tabs("feasibility"); });

            interact_with_tabs("inspector");

    }

    var msToMinSecStr = function(timeInMs) {
        var timeInSeconds = timeInMs / 1000;
        var minutes = Math.floor(timeInSeconds/60).toFixed(0).toString();
        if (minutes.toString().length == 1)
            minutes = "0" + minutes;
        var seconds = (timeInSeconds % 60);
        var displaySeconds = seconds.toFixed(2).toString()
        if (seconds < 10)
            displaySeconds = "0" + displaySeconds;
        return minutes + ":" + displaySeconds; 
    }

    var setDuration = function(durInMs, scale) {
        durInMs = Math.round(durInMs);

        if (!scale) {
        
            lookFromEasingCurveView.setTotalTime(durInMs/1000);
            lookAtEasingCurveView.setTotalTime(durInMs/1000);
        
        } else {            
            
            var prevDuration = trajectory.totalTime*1000;
            var scaleFactor = durInMs/prevDuration;
            $("#scrub_control").slider("option", "value", Math.round($("#scrub_control").slider("option", "value") * scaleFactor));
            
            trajectory.scaleKeyframeTimes(scaleFactor);
            lookFromEasingCurveView.scaleTotalTime(durInMs/1000);
            lookAtEasingCurveView.scaleTotalTime(durInMs/1000);

        }
        $("#scrub_control").slider("option", "max", durInMs);

        trajectory.setTotalTime(durInMs);

        var durInSec = (durInMs/1000) % 60;
        var durInMin = Math.floor((durInMs/1000) / 60);
        $("#scrub_max").text(msToMinSecStr(durInMs));
        $("#minutes").val(durInMin);
        $("#seconds").val(durInSec);
        setSliderTicks(trajectory);

    }


    function setSliderTicks(trajectory){
        var $slider =  $('#scrub_control');
        $slider.find('.ui-slider-tick-mark').remove();
        var max =  $slider.slider("option", "max");
        for (var i = 0; i < trajectory.keyframeTimes.length ; i++) {
            var timeInSeconds = trajectory.keyframeTimes[i];
            var spacing = 100 * (timeInSeconds * 1000)/max;
            $('<span class="ui-slider-tick-mark"></span>').css('left', spacing +  '%').appendTo($slider); 
        }
    }

    function updateRevisionDisplay() {
        var cR = ENV.currentRevision || 0;
        document.getElementById(ENV.shotrevcount_selector).innerHTML = cR + "/" + ENV.revisionCount;
    }

    //Public API
    return {

        init: function() {

            ENV.shotName = getUrlVars()['shot'];
            ENV.forceRevision = getUrlVars()['rev'];
            ENV.currentRevision = ENV.forceRevision;
            ENV.revisionCount = 0;
            updateRevisionDisplay();
            if (ENV.shotName) {
                document.getElementById(ENV.shotname_selector).value = ENV.shotName;
            }


            setupDOMEvents();

            var CameraViewModel = Models.CameraViewModel;
            trajectory = CameraViewModel.trajectory = new Trajectory.Trajectory(CameraViewModel);
            feasibilityManager = new Feasibility();

            CameraViewModel.on ('change:pose', null, function(pose) {
                $('#lf_lat').css({"background-color": ""});
                $('#lf_lng').css({"background-color": ""});
                $('#lf_alt').css({"background-color": ""});

                $('#lf_lat').val(pose.lat.toFixed(8));
                $('#lf_lng').val(pose.lng.toFixed(8));
                $('#lf_alt').val(pose.altitude.toFixed(2));
                $('#roll').html(pose.roll.toFixed(2));
                $('#pitch').html(pose.tilt.toFixed(2));
                $('#yaw').html(pose.heading.toFixed(2));
            });

            CameraViewModel.on ('change:lookAt', null, function(lookAt) {
                $('#la_lat').css({"background-color": ""});
                $('#la_lng').css({"background-color": ""});
                $('#la_alt').css({"background-color": ""});

                $('#la_lat').val(lookAt.lat.toFixed(8));
                $('#la_lng').val(lookAt.lng.toFixed(8));
                $('#la_alt').val(lookAt.altitude.toFixed(2));
            });

            CameraViewModel.on('change:trajectory', null, function (trajectoryData) {
                if (trajectory.keyframeList.length > 0) {

                    var durInMs = Math.round(trajectoryData.trajectory.totalTime*1000);
                    $("#scrub_control").slider("option", "disabled", false);
                    $("#scrub_control").slider("option", "max", durInMs);
                    setSliderTicks(trajectoryData.trajectory);

                    if (!trajectoryData.noScrub && trajectoryData.changedIndex != undefined) {
                        var val = trajectory.keyframeTimes[trajectoryData.changedIndex] * 1000;
                        $("#scrub_control").slider("option", "value", val);
                        currentKfIndex = trajectoryData.changedIndex;
                    }
                    if (trajectory.posDist && trajectory.lookAtDist) {
                        
                        var lookFromEasingKeyframes = [];
                        for (var i = 0; i < trajectory.keyframeTimes.length; i++) {
                            lookFromEasingKeyframes.push({
                                t: trajectory.keyframeTimes[i],
                                d: trajectory.posDist[i],
                                constrained: true
                            });
                        }
                        var lookFromEasingKnots = lookFromEasingCurveView.setKeyframes(lookFromEasingKeyframes, trajectory.totalTime);

                        var lookAtEasingKeyframes = [];
                        for (var i = 0; i < trajectory.keyframeTimes.length; i++) {
                            lookAtEasingKeyframes.push({
                                t: trajectory.keyframeTimes[i],
                                d: trajectory.lookAtDist[i],
                                constrained: true
                            });
                        }
                        var lookAtEasingKnots = lookAtEasingCurveView.setKeyframes(lookAtEasingKeyframes, trajectory.totalTime);

                        trajectory.reparameterizeSpline(lookAtEasingKnots, lookAtEasingCurveView.totalDist, lookFromEasingKnots, lookFromEasingCurveView.totalDist);
                        Models.Feasibility.invalidate();
                        feasibilityManager.calculateFeasibility(trajectory, lookAtEasingCurveView.getCurveKnots(), lookAtEasingCurveView.totalDist, lookFromEasingCurveView.getCurveKnots(), lookFromEasingCurveView.totalDist);

                        console.log("***** DONE *****");

                    } else {
                        Models.Feasibility.invalidate();
                    }

                } else {
                    console.log("*** No keyframes in trajectory ***");
                    $("#scrub_control").slider("option", "value", 0);
                    $("#scrub_control").slider("option", "disabled", true);
                }



            });

            CameraViewModel.on('change:animation', null, function (timeOfAnimation) {
                if (timeOfAnimation >= trajectory.keyframeTimes[trajectory.keyframeTimes.length - 1])
                    document.getElementById('scrub_pp_button').innerHTML = "Play";

                if (timeOfAnimation > trajectory.keyframeTimes[currentKfIndex]) {
                    while (currentKfIndex + 1 < trajectory.keyframeTimes.length && timeOfAnimation >= trajectory.keyframeTimes[currentKfIndex + 1]) {
                        currentKfIndex++;
                    }
                } else if (timeOfAnimation < trajectory.keyframeTimes[currentKfIndex]) {
                    while (timeOfAnimation < trajectory.keyframeTimes[currentKfIndex]) {
                        currentKfIndex--;
                    }
                }

                $("#scrub_control").slider("option", "value", timeOfAnimation * 1000);

                lookFromEasingCurveView.setCurrentTime(timeOfAnimation);
                lookAtEasingCurveView.setCurrentTime(timeOfAnimation);
                feasibilityManager.setScrubLinePositions(timeOfAnimation);

            });

            CameraViewModel.on('change:optimization', null, function (optimizationData) {
                Models.Feasibility.invalidate();
                /*  
                    set the infeasibility 
                    derive the feasibility using the given data
                    set the easing curves for the given data
                */
            });


            //Set up our easing curve.
            lookFromEasingCurveView = new EasingCurve(ENV.look_from_easing_selector, "Look-From Progress", 200, 200);
            lookAtEasingCurveView = new EasingCurve(ENV.look_at_easing_selector, "Look-At Progress", 200, 200);
            windowResize();

            lookFromEasingCurveView.on('change:keyframe', function(kf) {
                trajectory.modifyKeyframeTimeAtIndex(kf.kf, kf.t);
                lookAtEasingCurveView.editKeyframeTime(kf.kf, kf.t);
                setSliderTicks(trajectory);
            });

            lookAtEasingCurveView.on('change:keyframe', function(kf) {
                trajectory.modifyKeyframeTimeAtIndex(kf.kf, kf.t);
                lookFromEasingCurveView.editKeyframeTime(kf.kf, kf.t);
                setSliderTicks(trajectory);
            });

            lookFromEasingCurveView.on('change:curve', function(newKnots) {
                var lookAtKnots = lookAtEasingCurveView.getCurveKnots();
                trajectory.reparameterizeSpline(lookAtKnots, lookAtEasingCurveView.totalDist, newKnots, lookFromEasingCurveView.totalDist);
                feasibilityManager.calculateFeasibility(trajectory, lookAtEasingCurveView.getCurveKnots(), lookAtEasingCurveView.totalDist, lookFromEasingCurveView.getCurveKnots(), lookFromEasingCurveView.totalDist);

            });

            lookAtEasingCurveView.on('change:curve', function(newKnots) {
                var lookFromKnots = lookFromEasingCurveView.getCurveKnots();
                trajectory.reparameterizeSpline(newKnots, lookAtEasingCurveView.totalDist, lookFromKnots, lookFromEasingCurveView.totalDist);
                feasibilityManager.calculateFeasibility(trajectory, lookAtEasingCurveView.getCurveKnots(), lookAtEasingCurveView.totalDist, lookFromEasingCurveView.getCurveKnots(), lookFromEasingCurveView.totalDist);
            });

            

            Models.Feasibility.on("change:feasibility:invalidate", null, function() {
                feasibilityManager.markInvalid();
            });

            new Promise(function(resolve, reject) {
                
                gEarth.init(resolve);

                gGodView = new gMaps.GoogleMaps(ENV.god_selector,
                    CameraViewModel, 
                    { 
                        center: {
                            lat: ENV.g_hooverTower.lat, 
                            lng: ENV.g_hooverTower.lng
                        }, 
                        zoom: 18
                    });
                
            }).then(function() {

                return new Promise(function(resolve, reject) {
                    gCameraView = window.gCameraView = new gEarth.GoogleEarth(ENV.camera_selector, CameraViewModel, resolve, reject);                    
                });

            }).then(function() {

                gCameraView.setLayersVisible();
                gCameraView.setTour('MEDIUM', false);

                if (ENV.shotName) {
                    //Wrapping JQuery promise in a JavaScript Promise. 
                    //Perhaps there is a better way, no time to look now, must keep coding
                    //must keep swimming
                    //just keep swimming
                    //oh god
                    return Promise.all([new Promise(function(resolve, reject) {

                        //LOAD THE SHOT KEYFRAMES
                        var params = {shot:ENV.shotName}
                        if (ENV.forceRevision)
                            params.rev = ENV.forceRevision
                        $.ajax({
                            
                            type: 'GET',
                            url: '/api/get_shot?' + $.param(params),
                            contentType: "application/json; charset=utf-8",
                            dataType: "json",

                        }).then(function(data, status, xhr) {
                            //console.log(data);
                            //update DOM with camera/quad properties if saved
                            //back capatability: uses default properties
                            if(data['quadProps']) {
                                if (data['quadProps'] === "Solo"){
                                    $('#quadProperties option[value="Solo"]').attr("selected", true);   
                                }
                            } //default auto fills IRIS+

                            if(data['lensProps']) {
                                if(data['lensProps'] === "NARROW") {
                                    $("#fov_narrow").prop('checked', true);
                                    gCameraView.setTour('NARROW', false);
                                } else if (data['lensProps'] === "WIDE") {
                                    $("#fov_wide").prop('checked', true);
                                    gCameraView.setTour('WIDE', false);
                                }
                            } //default auto fills medium

                            if(data['aspectRatio']) {
                                if(data['aspectRatio'] === "4:3") {
                                    ENV.godViewWidthRatio = 4;
                                    ENV.godViewHeightRatio = 3;
                                    $("#ratio4-3").prop('checked', true);
                                }
                            } //default auto fills 16:9
                            console.log("finished adding quad/camera properties to inspector");


                            if (data['keyFrameList']) {
                                console.log(data['keyFrameList']);
                                console.log("LOADING KEYFRAMES");
                                ENV.revisionCount = data['revisions'];
                                if (!ENV.currentRevision)
                                    ENV.currentRevision = ENV.revisionCount;
                                updateRevisionDisplay();

                                setDuration(data['totalTimeMs'], false)
                                trajectory.setKeyframes(data['keyFrameList'], data['keyframeTimes'], data['refLLH']);

                                lookAtEasingCurveView.setState(data['lookAtCurve']);
                                lookFromEasingCurveView.setState(data['lookFromCurve']);

                                if(trajectory.keyframeList[0]){ //autosaves may not have any KFs
                                    var firstPose = _.extend(trajectory.keyframeList[0].cameraPose, CoordSystem.llh2Euler(trajectory.keyframeList[0].cameraPose, trajectory.keyframeList[0].lookAt));
                                    CameraViewModel.setCameraPose(firstPose);    
                                }
                                
                                renderKeyframes();
                                loadedShot = true;
                                resolve();
                            } else {
                                messageInPopover("Error with data returned from server, doesn't contain expected values");
                            }

                        }).fail(function(xhr, status, error) {
                            messageInPopover("Error loading keyframes for shot:<br/>" + xhr.status + " " + status);
                            reject();
                        })

                    }), new Promise(function(resolve, reject) {

                        resolve();

                        // //SEE IF WE CAN LOAD A LOG AS WELL
                        // $.ajax({
                            
                        //     type: 'GET',
                        //     url: '/api/get_log?' + $.param({shot:ENV.shotName}),
                        //     contentType: "application/json; charset=utf-8",
                        //     dataType: "json",

                        // }).then(function(data, status, xhr) {
                            
                        //     if (data['messages']) {
                        //         console.log("LOADING LOG MESSAGES");
                        //         Dataflash.init(data);
                        //         renderLogPositions(Dataflash.getKeyframeList());

                        //     } else {
                        //         console.log("Error with log data returned from server, doesn't contain expected values");
                        //     }

                        // }).done(function() {
                        //     resolve();
                        // })
                    })]);

                } else {
                    CameraViewModel.setCameraPose(ENV.g_hooverTower);
                }

            }).then(function(data, status, xhr) {
                setInterval(function() {
                    $.ajax({
                        type: 'GET',
                        url: '/api/get_vehicle_pos',
                        contentType: "application/json; charset=utf-8",
                        dataType: "json",

                    }).then(function(data, status, xhr) {
                        if (data['status'] && data['status'] == "success") {
                            if (data['starting_lng'] != '0' || data['starting_lng'] != '0') {
                                gGodView.getAltitudeForLatLng(parseFloat(data['starting_lat']), parseFloat(data['starting_lng']),
                                    function(altitude) {
                                        console.log("Starting altitude: ", altitude);
                                        trajectory.setStartAltitude(altitude);
                                        gGodView.setStartLocation(parseFloat(data['starting_lat']), parseFloat(data['starting_lng']));
                                    }
                                );
                            } else {
                                gGodView.hideStartMarker();
                            }
                            gGodView.setCurrentLocation(parseFloat(data['current_lat']), parseFloat(data['current_lng']));
                        } else {
                            gGodView.hideStartMarker();
                        }
                    });
                }, 1000); //then set interval for auto save = true

                if (!loadedShot) {
                    //get new name for file, auto save iniital shot = true
                    getShotName();
                    getInitialDuration();
                } else {
                    //add auto save timed function after name confirmed
                    startAutoSaving();
                    hidePopover();  
                }
                              

            }).catch(function(error) {

                console.log(error.stack);
                debugger;

            });

       }
    }

});