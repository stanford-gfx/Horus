define(['coord_system'], function(CoordSystem) {

    return {

        getCircleStrafeKeyframes: function(circleCenterLLH, circleEdgePose, options) {
            options = options || {}

            var dist = CoordSystem.get_distance_ll(circleCenterLLH, circleEdgePose);

            var ned = CoordSystem.llh2ned(circleCenterLLH, circleEdgePose); 
            var angle = (Math.atan(ned.n/ned.e));
            if (ned.e < 0) {
                if (angle > 0) 
                    angle += Math.PI;
                else
                    angle -= Math.PI;
            }

            var STEPS = options.steps || 16;
            var keyFrameList = [];
            for (var i = 0; i < STEPS; i++) {


                var n = dist * Math.sin(angle) / CoordSystem.LOCATION_SCALING_FACTOR;
                var e = dist * Math.cos(angle) / CoordSystem.LOCATION_SCALING_FACTOR / CoordSystem.longitude_scale(circleCenterLLH);

                var circlePnt = _.clone(circleCenterLLH)
                circlePnt.altitude = circleEdgePose.altitude;
                circlePnt.lat += n;
                circlePnt.lng += e;
                circlePnt.tilt = circleEdgePose.tilt;
                circlePnt.roll = circleEdgePose.roll;

                var yaw = (-90 + (-1*(angle * CoordSystem.RAD_TO_DEG)));
                
                circlePnt.heading = yaw;

                keyFrameList.push({
                    cameraPose: _.clone(circlePnt),
                    lookAt:     _.clone(circleCenterLLH),
                })

                angle -= (360 * CoordSystem.DEG_TO_RAD) / (STEPS-1);

            }
            return keyFrameList; 

        }


    }
	
})