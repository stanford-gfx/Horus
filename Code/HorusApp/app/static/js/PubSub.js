define(function() {
	
    /* 
    PubSub is an event system, 
    where the publisher can be a subscriber 
    but will not get his own events.
    This avoids circular events.
    */
    var PubSub = {

        on: function(name, subscriber, callback, context) {
            if (!eventsApi(this, 'on', name, [callback, subscriber, context]) || !callback) return this;
            this._events || (this._events = {});
            var events = this._events[name] || (this._events[name] = []);
            events.push({callback: callback, subscriber: subscriber, context: context, ctx: context || this});
            return this;
        },

        trigger: function(name, caller) {
            if (!this._events) return this;
            var args = [].slice.call(arguments, 2);
            if (!eventsApi(this, 'trigger', name, args) || !caller) return this;
            var events = this._events[name];
            var allEvents = this._events.all;
            if (events) triggerEvents(events, caller, args);
            if (allEvents) triggerEvents(allEvents, caller, arguments);
            return this;
        }

    }


    var eventSplitter = /\s+/;

    var eventsApi = function(obj, action, name, rest) {
        if (!name) return true;
        
        if (typeof name === 'object') {
            for (var key in name) {
                obj[action].apply(obj, [key, name[key]].concat(rest));
            }
            return false;
        }

        if (eventSplitter.test(name)) {
            var names = name.split(eventSplitter);
            for (var i = 0, l = names.length; i < l; i++) {
                obj[action].apply(obj, [names[i]].concat(rest));
            }
            return false;
        }

        return true;
    };

    var triggerEvents = function(events, caller, args) {
        var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
        switch (args.length) {
            case 0: while (++i < l)  if ((ev = events[i]).subscriber != caller) { ev.callback.call(ev.ctx); } return;
            case 1: while (++i < l)  if ((ev = events[i]).subscriber != caller) { ev.callback.call(ev.ctx, a1); } return;
            case 2: while (++i < l)  if ((ev = events[i]).subscriber != caller) { ev.callback.call(ev.ctx, a1, a2); } return;
            case 3: while (++i < l)  if ((ev = events[i]).subscriber != caller) { ev.callback.call(ev.ctx, a1, a2, a3); } return;
            default: while (++i < l) if ((ev = events[i]).subscriber != caller) { ev.callback.apply(ev.ctx, args); } return;
        }
    };

    return PubSub
});