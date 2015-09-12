define(['underscore', 'backbone', 'models', 'feasibilityplot', 'env', 'coord_system'], function (_, Backbone, Models, FeasibilityPlot, ENV, CoordSystem) {

var Feasibility = function() { 
    this.isUpToDate = false;
    this.plots = {};
    this.createFeasibilityPlots();
    this.lastData = null;
}

_.extend(Feasibility.prototype, Backbone.Events, {
	createFeasibilityPlots: function() {

        for (var k in ENV.constraints) {
            var plot_data = ENV.constraints[k];
            var plot = new FeasibilityPlot("#" + plot_data.selector, plot_data.title, plot_data.xLabel, plot_data.yLabel, 250, 130);
            if (plot_data.legendText)
                plot.setLegend(plot_data.legendText);
            if (plot_data.upperConstraint != undefined && plot_data.lowerConstraint != undefined)
                plot.setConstraints(plot_data.lowerConstraint, plot_data.upperConstraint);
            this.plots[k] = plot;
        }

	},

	calculateFeasibility: function(trajectory, lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist) {
		if (trajectory.keyframeList.length > 1) {
            var self = this;

            P = trajectory.fullTrajectoryToArrays(trajectory.keyframeList, trajectory.lookAtUnsampledTvals, trajectory.posUnsampledTvals, lookAtEasingKnots, lookAtTotalDist, lookFromEasingKnots, lookFromTotalDist, trajectory.refLLH);

            P = _.extend(P, {
                totalShotTime: trajectory.keyframeTimes[trajectory.keyframeTimes.length-1]
            });

            $.ajax({
                type: 'POST',
                url: '/api/calculate_feasibility_ned',
                data: JSON.stringify(P),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
            }).done(function(data, status, xhr) {
                if (data['u_nominal'] &&
                    data['p_body_nominal'] &&
                    data['p_body_dot_nominal'] &&
                    data['p_body_dot_dot_nominal'] &&
                    data['theta_body_nominal'] &&
                    data['phi_body_nominal'] &&
                    data['theta_cam_nominal'] &&
                    data['theta_cam_dot_nominal'] &&
                    data['psi_cam_nominal'] &&
                    data['phi_cam_nominal'] &&
                    data['phi_cam_dot_nominal']) {

                        self.lastData = data;
                        self.lastTrajectory = trajectory;
                        self._drawPlots();
                        self.calculateAgainstConstraints();
                        self.isUpToDate = true;
                        ENV.clearRecoverbleError();

                } else {
                    ENV.showRecoverableError("calculateFeasibility", "Unrecognized data received");
                }
            }).fail(function(xhr, status, error) {
                ENV.showRecoverableError("calculateFeasibility", "Invalid trajectory or easing curve. " + error);
            });
        }
	},

    calculateAgainstConstraints: function() {
        var data = this.lastData;

        var nsamples = this.lastData.u_nominal.length;
        var feasibility = new Array(nsamples);


        var errorMetric = function(x1, lower, upper) {
            var shift = 0 - lower;
            var scale = upper - lower;
            var val = (x1 + shift)/scale;
            if (x1 >= upper)
                return val - 1;
            else
                return Math.abs(val);
        }

        var infeasibleShot = false;
        var violatingConstraints = {};
        //Check against every constraints
        for (var k in ENV.constraints) {
            var c = ENV.constraints[k];
            $("#"+c.selector).removeClass('plot_infeasible');
            if (c.keys) {
                for (var inspect in c.keys) {

                    //over all the samples
                    //save which ones we violate, and by how much

                    for (var i = 0; i < nsamples; i++) {
                        var timeOfSample = i;
                        var valToCheck = data[c.keys[inspect]][i];
                        if (c.keyTransformer) {
                            valToCheck = c.keyTransformer(valToCheck)
                        }

                        if (c.upperConstraint && valToCheck > c.upperConstraint) {
                            console.log("Violating upper", k, i, valToCheck, c.upperConstraint);
                            feasibility[i] = feasibility[i] || {}
                            feasibility[i][k] = errorMetric(valToCheck, c.lowerConstraint, c.upperConstraint);  
                            violatingConstraints[k] = true;  
                            infeasibleShot = true;
                        } 
                        if (c.lowerConstraint && valToCheck < c.lowerConstraint) {
                            console.log("Violating lower", k, i,  valToCheck, c.lowerConstraint);
                            feasibility[i] = feasibility[i] || {}
                            feasibility[i][k] = errorMetric(valToCheck, c.lowerConstraint, c.upperConstraint);
                            violatingConstraints[k] = true;
                            infeasibleShot = true;
                        }
                    }

                }
            }
        }

        //Now we sum up the infeasibility error metrics
        for (var i in feasibility) {
            var summation = 0;
            for (k in feasibility[i]) {
                summation += feasibility[i][k]
            }
            feasibility[i]['sum'] = summation;
            console.log(i, summation)
        }

        //Hook into plot displays
        if (infeasibleShot) {
            $("#tab_feasibility").addClass('tab_infeasible');
        } else {
            $("#tab_feasibility").removeClass('tab_infeasible');
        }

        for (var k in violatingConstraints) {
            $("#"+ENV.constraints[k].selector).addClass('plot_infeasible');
        }

        Models.Feasibility.set(
            { 
                reparameterizedTimes: this.lastTrajectory.reparameterizedTimes, 
                feasibility:feasibility
            });


    },

    _drawPlots: function(trajectory, data) {
        var trajectory = this.lastTrajectory;
        var data = this.lastData;

        this._plotMotorForces(trajectory, data['u_nominal']);

        this._plotAngles(trajectory, [data['phi_cam_nominal']], 'gimbal_angle_roll');
        this._plotAngles(trajectory, [data['phi_body_nominal'], data['theta_body_nominal']], 'quad_lean_angle');
        this._plotAngles(trajectory, [data['theta_cam_nominal']], 'gimbal_angle_pitch');
        this._plotAngles(trajectory, [data['psi_cam_nominal']], 'gimbal_angle_yaw');

        this._plotAngles(trajectory, [data['phi_cam_dot_nominal'], data['theta_cam_dot_nominal']], 'gimbal_velocity', true );

        this._plotWorldSpacePosition(trajectory, data['p_body_nominal']);

        this._plotHorizontal(trajectory, data['p_body_dot_nominal'], 'world_space_velocity_h');
        this._plotVertical(trajectory,   data['p_body_dot_nominal'], 'world_space_velocity_v');
        this._plotHorizontal(trajectory, data['p_body_dot_dot_nominal'], 'world_space_acceleration_h');
        this._plotVertical(trajectory,   data['p_body_dot_dot_nominal'], 'world_space_acceleration_v', true);
    },

    setScrubLinePositions: function(timeInSeconds) {
        if (this.isUpToDate) {
            for(var key in this.plots) {
                this.plots[key].setScrubLinePosition(timeInSeconds);
            }
        }
    },

    markInvalid: function() {
        if (this.isUpToDate) {
            this.isUpToDate = false;
            for(var key in this.plots) {
                this.plots[key].grayOut();
            }
        }
    },

	_uNominalToPlotLineArrays: function(u_nominal) {
		var plotLines = [[],[],[],[]];
		_.map(u_nominal, function(s) {
			plotLines[0].push(s[0]);
			plotLines[1].push(s[1]);
			plotLines[2].push(s[2]);
			plotLines[3].push(s[3]);
		})

		return plotLines;
	},

    _plotAngles: function(trajectory, dataInRadians, key, isSpeed) {
        var dataInDegrees = _.map(dataInRadians, function(arr) { return _.map(arr, function(r) { 
                var ret = r * CoordSystem.RAD_TO_DEG;
                if (isSpeed)
                    ret = Math.abs(ret)
                return ret; 
            })});
        this.plots[key].setXAxis(trajectory.keyframeTimes);
        this.plots[key].setData(trajectory.reparameterizedTimes, dataInDegrees);
    },

    _plotHorizontal: function(trajectory, data, key) {
        var horizontal = _.map(data, function(arr) { return Math.sqrt(arr[0] * arr[0] + arr[2] * arr[2]);});
        this.plots[key].setXAxis(trajectory.keyframeTimes);
        this.plots[key].setData(trajectory.reparameterizedTimes, [horizontal]);
    },

    _plotVertical: function(trajectory, data, key, isAccel) {
        var vertical = _.map(data, function(arr) { 
            var res = arr[1] * -1;
            // if (!isAccel)
                // res = Math.abs(res);
            return res;
        });
        this.plots[key].setXAxis(trajectory.keyframeTimes);
        this.plots[key].setData(trajectory.reparameterizedTimes, [vertical]);
    },

	_plotMotorForces: function(trajectory, u_nominal) {
        var self = this;
        var plotLines = this._uNominalToPlotLineArrays(u_nominal);
        this.plots['motor_forces'].setXAxis(trajectory.keyframeTimes);
		this.plots['motor_forces'].setData(trajectory.reparameterizedTimes, plotLines);
	},

    _plotWorldSpacePosition: function(trajectory, p_body_nominal) {
        this.plots['world_space_pos'].setXAxis(trajectory.keyframeTimes);
        var offset = trajectory.refLLH.altitude;
        p_body_nominal = _.map(p_body_nominal, function (a) { return offset - a[1]; });
        this.plots['world_space_pos'].setData(trajectory.reparameterizedTimes, [p_body_nominal]);
    },


});

return Feasibility;

});