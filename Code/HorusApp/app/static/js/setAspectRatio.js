define (function(window, document){

	return {
		resizeDiv: function(inner, outer, height, width) {
		    var ratio = height/width;

		    if (outer.height() > outer.width() * ratio) {
		        inner.css({'width': '100%'});
		        inner.css({'height': inner.width() * ratio});
		    } else {
		        inner.css({'height': '100%'});
		        inner.css({'width': inner.height() / ratio});
		    }
		}		
	}
});
