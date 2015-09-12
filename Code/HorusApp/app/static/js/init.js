    requirejs.config({
        baseUrl: "/static/js",
    
        //Annoying cache-buster
        urlArgs: "bust=" + (new Date()).getTime(),
    
        //Where to find non-AMD modules
        paths: {
            'underscore': 'lib/underscore-min',
            'backbone': 'lib/backbone',
            'backbone-relational': 'lib/backbone-relational',
            'jquery': 'lib/jquery-2.1.1.min',
            'jquery-ui': 'lib/jquery-ui.min',
            'p5': 'lib/p5',
            'd3': 'lib/d3.min',
        },
    
        //Support non-AMD modules
        shim: {
            underscore: {
                exports: '_'
            },
            backbone: {
                deps: ['underscore'],
                exports: 'Backbone'
            }
        }
    });
    
    require(['jquery-ui', 'jquery', 'app', 'p5'], function($, $, app, p5) {
    
        $(document).ready(function() {
            app.init();
        });
    
        $(function() {
            $( "#scrub_control" ).slider({min: 0, max: 1000, disabled: true});
            $("#scrub_control").css('border-radius','0px');
        });
    });