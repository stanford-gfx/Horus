define(['underscore', 'backbone', 'PubSub', 'env', 'coord_system'], function(_, Backbone, PubSub, ENV, CoordSystem) {


    /* Models */

    CameraViewModel = _.extend(PubSub, {

        pose: ENV.g_hooverTower,

        updateTrajectory: function(trajectoryData, caller) { //key frame list, sample list, timeslist, index
            caller = caller || this;
            this.trajectory = trajectoryData.trajectory;
            this.trigger('change:trajectory', caller, trajectoryData);
        },

        optimizeTrajectory: function(optimization, caller) {
            caller = caller || this;
            this.trigger('change:optimization', caller, optimization);
        },

        updateTrajectoryReparameterization: function(trajectory, caller) {
            caller = caller || this;
            this.trajectory = trajectory;
            this.trigger('change:reparameterization', caller, trajectory);
        },

        /* This supports partial updates! */
        setCameraPose: function(pose, caller) {
            caller = caller || this;
            this.pose = _.extend(this.pose, pose);
            if (this.lookAt) {
                var rollPitchYaw = CoordSystem.llh2Euler(this.pose, this.lookAt);
                this.pose = _.extend(this.pose, rollPitchYaw);
            }
            this.trigger('change:pose', caller, this.pose);
        },

        setLookAt: function(lookAt, caller) {
            caller = caller || this;
            this.lookAt = this.lookAt ? _.extend(this.lookAt, lookAt) : lookAt;
            this.trigger('change:lookAt', caller, this.lookAt);
        },

        updateScrubBar: function(newTime, caller) {
            caller = caller || this;
            this.trigger('change:animation', caller, newTime);
        }

    });

    /* Stores the checked feasibility 
     * {
     *   feasibility: Array of {constraintViolated: amt, sum: amt} or null if no violation
     *   reparameterizedTimes: Array of timestamps
     * }
     */
    Feasibility = _.extend(PubSub, {
        
        lastFeasibility: null,

        get: function() {
            return this.lastFeasibility;
        },

        set: function(feasibility) {
            this.lastFeasibility = feasibility;
            console.log(feasibility);
            this.trigger("change:feasibility", this, this.lastFeasibility);
        },

        invalidate: function() {
            this.lastFeasibility = null;
            this.trigger("change:feasibility", this, null);
            this.trigger("change:feasibility:invalidate", this);
        },

        exists: function() {
            return this.lastFeasibility != null;
        }

    });

    return {

        CameraViewModel: CameraViewModel,
        Feasibility: Feasibility
    }

});