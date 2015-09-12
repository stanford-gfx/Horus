define(['underscore', 'PubSub'], function(_, PubSub) {

    return {
        
        /* HTML Selectors */
        camera_selector: "g_camera_view",
        
        god_selector: "g_god_view",

        data_selector: "data",

        current_pose_selector: "currentPose",

        popover_selector: "popover",

        popover_message_selector: "popover-message",

        shotname_selector: "shot_name",

        shotrevcount_selector: "revision_count",

        look_from_easing_selector: "look_from_easing_curve",

        look_at_easing_selector: "look_at_easing_curve",

        bg_process_spinner_selector: "bg_process_spinner",

        motor_speeds_plot_selector: "motor_forces_plot",

        autosave_every_ms: 30*1000,

        godViewWidthRatio: 16,
        godViewHeightRatio: 9,

        /* Default Poses */

        g_hooverTower: {
            lat     : 37.42726975867168,
            lng    : -122.16676019825722,
            altitude     : 125.2053637061234,
            heading      : -31.127314342134174,
            tilt         : 51.24538395621526,
            roll         : 0.0,
            altitudeMode : 2,
        },

        // g_hooverTower: {
        //     lat     : 37.87352994489542,
        //     lng    : -122.30290635565484,
        //     altitude     : 33.47002070925501,
        //     heading      : 121.96596023862232
        //     tilt         : 59.99854707788068,
        //     roll         : 0.0,
        //     altitudeMode : 2,
        // },

        /* Constraint Plots */
        constraints: {
            motor_forces: {
                title: "Motor Forces",
                selector: "motor_forces_plot",
                keys: ['u_nominal'],
                xLabel: "Time in Seconds",
                yLabel: "Newtons",
                legendText: ["Motor 1", "Motor 2", "Motor 3", "Motor 4"],
                lowerConstraint: 0,
                upperConstraint: 7.5,
            }, 
            gimbal_angle_roll: {
                title: "Gimbal Roll",
                selector: "gimbal_angle_roll_plot",
                keys: ['phi_cam_nominal'],
                xLabel: "Time in Seconds",
                yLabel: "Degrees",
                lowerConstraint: -45,
                upperConstraint: 45,
            }, 
            gimbal_angle_pitch: {
                title: "Gimbal Pitch",
                selector: "gimbal_angle_pitch_plot",
                keys: ['theta_cam_nominal'],
                xLabel: "Time in Seconds",
                yLabel: "Degrees",
                lowerConstraint: -90,
                upperConstraint: 0,
            }, 
            gimbal_angle_yaw: {
                title: "Gimbal Yaw",
                selector: "gimbal_angle_yaw_plot",
                keys: ['psi_cam_nominal'],
                xLabel: "Time in Seconds",
                yLabel: "Degrees",
                lowerConstraint: -3,
                upperConstraint: 3,
            }, 
            gimbal_velocity: {
                title: "Gimbal Velocity",
                selector: "gimbal_velocity_plot",
                // keys: ['phi_cam_dot_nominal', 'theta_cam_dot_nominal'],
                // keyTransformer: function() {

                // }
                xLabel: "Time in Seconds",
                yLabel: "Degrees/Seconds",
                lowerConstraint: 0,
                upperConstraint: 90,
                legendText: ["Roll", "Pitch"],
            },
            quad_lean_angle: {
                title: "Quad Orientation",
                selector: "quad_lean_angle_plot",
                keys: ['phi_body_nominal', 'theta_body_nominal'],
                xLabel: "Time in Seconds",
                yLabel: "Degrees",
                lowerConstraint: -30,
                upperConstraint: 30,
                legendText: ["Roll", "Pitch"],
            },
            world_space_pos: {
                title: "Altitude Above Sea Level",
                selector: "world_space_pos_plot",
                xLabel: "Time in Seconds",
                yLabel: "Meters",
                lowerConstraint: 0,
                //upperConstraint: 125,
                legendText: ["Altitude"],
            },
            
            world_space_velocity_h: {
                title: "Quad Horizontal Velocity",
                selector: "world_space_vel_plot_h",
                keys: ['p_body_dot_nominal'],
                keyTransformer: function(v) { return Math.sqrt(v[0]*v[0] + v[2]*v[2]) },
                xLabel: "Time in Seconds",
                yLabel: "Meters/Second",
                lowerConstraint: 0,
                upperConstraint: 10
            },

            world_space_velocity_v: {
                title: "Quad Vertical Velocity",
                selector: "world_space_vel_plot_v",
                keys: ['p_body_dot_nominal'],
                keyTransformer: function(v) { return -1*v[1] },
                xLabel: "Time in Seconds",
                yLabel: "Meters/Second",
                lowerConstraint: -2,
                upperConstraint: 2.5
            },

            world_space_acceleration_h: {
                title: "Horizontal Acceleration",
                selector: "world_space_acc_plot_h",
                keys: ['p_body_dot_dot_nominal'],
                keyTransformer: function(v) { return Math.sqrt(v[0]*v[0] + v[2]*v[2]); },
                xLabel: "Time in Seconds",
                yLabel: "Meters/Second^2",
                lowerConstraint: 0,
                upperConstraint: 4
            },

            world_space_acceleration_v: {
                title: "Vertical Acceleration",
                selector: "world_space_acc_plot_v",
                keys: ['p_body_dot_dot_nominal'],
                keyTransformer: function(v) { return -1*v[1] },
                xLabel: "Time in Seconds",
                yLabel: "Meters/Second^2",
                lowerConstraint: -1.5,
                upperConstraint: 3
            },
        },


        /* Event Channels*/


        /* Error Handing */

        fatal_error: function(error) {
            alert("Fatal Error!\n" + error);
            debugger;
        },

        showRecoverableError: function(location, msg) {
            $("#recoverable_error_message").html(location + ': ' + msg);
            $("#recoverable_error_message").show();
        },

        clearRecoverbleError: function() {
            $("#recoverable_error_message").hide();
        },

        infoTimer: null,

        showInfo: function(msg) {
            $("#info_message").html(msg);
            $("#info_message").show();
            clearTimeout(this.infoTimer);
            this.infoTimer = setTimeout(_.bind(this.clearInfo, this), 2000);
              
        },

        clearInfo: function(msg) {
            clearTimeout(this.infoTimer);
            $("#info_message").hide();
        }

    }
})