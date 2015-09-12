define(function() {


    /* TYPES in our system: 
     *  location: { lat, lon }
     *  llh: { lat, lng, altitude }
     *  ned: { n, e, d }
     *  pose: { lat, lon, altitude, heading, pitch, roll }
    */

    return {

        // scaling factor from 1 degree to meters at the equater, as defined by the WGS84 geodesic
        LOCATION_SCALING_FACTOR :111318.84502145034,

        DEG_TO_RAD: (Math.PI / 180.0),

        RAD_TO_DEG: (180.0 / Math.PI),

        longitude_scale: function(location) {
            return Math.cos(location.lat * this.DEG_TO_RAD);
        },

        //Calculate the distance between two lat-lon points.
        get_distance_ll: function(llh1, llh2) {
            var dlat = llh2.lat - llh1.lat;
            var dlng = llh2.lng - llh1.lng;
            dlng *= this.longitude_scale(llh2);
            return Math.sqrt(Math.pow(dlat,2) + Math.pow(dlng,2)) * this.LOCATION_SCALING_FACTOR;
        }, 

        //Calculate the distance between two lat-lon points.
        get_distance_llh: function(llh1, llh2) {
            var dlat = llh2.lat - llh1.lat;
            var dlng = llh2.lng - llh1.lng;
            var dhgt = llh2.altitude - llh1.altitude || 0;
            dlng *= this.longitude_scale(llh2);
            return Math.sqrt(Math.pow(Math.sqrt(Math.pow(dlat,2) + Math.pow(dlng,2)) * this.LOCATION_SCALING_FACTOR,2) + Math.pow(dhgt,2));
        }, 


        //Calculate the north-east-down distance in meters between two lat-lon points
        llh2ned: function(llh1, llh2) {
            var dlat = llh2.lat - llh1.lat;
            var dlng = llh2.lng - llh1.lng;
            var dhgt = llh1.altitude - llh2.altitude || 0; 
            var n = dlat * this.LOCATION_SCALING_FACTOR;
            var e = dlng * this.LOCATION_SCALING_FACTOR * this.longitude_scale(llh2);
            return { n: n, e: e, d: dhgt };
        },

        //Recovers a LLH coordinate from a reference point and a 
        ned2llh: function(ned, llh_ref) {
            var lat      = llh_ref.lat      + ned.n / this.LOCATION_SCALING_FACTOR;
            var lng      = llh_ref.lng      + ned.e / (this.LOCATION_SCALING_FACTOR * this.longitude_scale(llh_ref));
            var altitude = llh_ref.altitude - ned.d;
            return { lat: lat, lng:lng, altitude: altitude };
        },

        //Given an (unnormalized) north-east-down direction vector, calculates the 
        //heading, then the tilt, with zero roll.
        // North is 0 degrees, East is 90 degrees, West is -90 degrees
        // Down is 0 degrees, Horizon is 90 degrees, up is 180 degrees.
        ned2Euler: function(d) {
            var length = Math.sqrt(d.n*d.n + d.e*d.e + d.d*d.d);
            var heading = Math.atan2(d.e, d.n)
            var tilt    = Math.acos(d.d / length);
            return { heading:heading * this.RAD_TO_DEG, tilt:tilt * this.RAD_TO_DEG, roll:0 }
        },

        // Given a look-from (llh1) and look-at (llh2) point, calculates the euler angles.
        // This does suffer from gimbal lock if looking straight down, which sucks - heading is ill-defined!
        llh2Euler: function(llh1, llh2) {
            return this.ned2Euler(this.llh2ned(llh1, llh2));
        }

    }

});