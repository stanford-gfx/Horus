define(['env', 'jquery'], function(ENV, $) {
	

    var logData = null;
    var processedData = {

    };
    var keyFrames = [];
    var process = function(dataMessages) {
        var positions = [];
        var times = [];
        var ahr2 = dataMessages['AHR2'];
        var ctun = dataMessages['CTUN'];
        console.log(ctun.Alt.length);
        var tOffset = ahr2.TimeMS[0];
        for (var i = 0; i < ahr2.Alt.length; i++) {

            var ctunIndex = Math.floor((i * ctun.Alt.length) / ahr2.Alt.length);

            positions.push({ 
                
                'cameraPose': {
                    'lat':      ahr2.Lat[i],
                    'lng':      ahr2.Lng[i],
                    'altitude': ctun.Alt[ctunIndex],
                    'heading':  ahr2.Yaw[i],
                    'tilt':     ahr2.Pitch[i],
                    'roll':     ahr2.Roll[i],
                    // 'TimeMS': ahr2.TimeMS[i] - tOffset,
                },
                
                'lookAt': {

                }
                
                });

            times.push((ahr2.TimeMS[i] - tOffset) / 1000);

        }


        return { 
            keyFrameList: positions, 
            timeList: times,
        };
    }

    var processAHR2ToKeyframes = function(ahr2) {

    }

    return {

        init: function(data) {
            window.logData = logData = data;

            if (data.messages['AHR2'] && data.messages['CTUN']) {
                var processed = process(data.messages);
                processedData['keyFrameList'] = processed.keyFrameList;
                processedData['timeList'] = processed.timeList;
            }
        },

        hasLog: function() {
            return logData != null;
        },

        getKeyframeList: function() {
            return processedData['keyFrameList'];
        }, 

        getTimeList: function() {
            return processedData['timeList'];
        }


    }

});