define(['underscore', 'backbone', 'd3', 'env'], function (_, Backbone, d3, ENV) {

var FeasibilityPlot = function(selector, title, xLabel, yLabel, w, h) {
	this.selector = selector;
	this.xLabel = xLabel;
	this.yLabel = yLabel;
	this.title = title;
	this.margin = {top: 10, right: 15, bottom: 18, left: 30},
	this.width = w - this.margin.left - this.margin.right;
	this.height = h - this.margin.top - this.margin.bottom;
	this.colors = ["rgb(158, 218, 229)",
            "rgb(219, 219, 141)", 
            "rgb(199, 199, 199)",
            "rgb(247, 182, 210)",
            "rgb(196, 156, 148)",
            "rgb(197, 176, 213)",
            "rgb(225, 122, 120)",
            "rgb(122, 193, 108)",
            "rgb(225, 157, 90)", 
            "rgb(144, 169, 202)",
            "rgb(109, 204, 218)", 
            "rgb(205, 204, 93)",
            "rgb(162, 162, 162)",
            "rgb(237, 151, 202)",
            "rgb(168, 120, 110)",
            "rgb(173, 139, 201)",
            "rgb(237, 102, 93)",
            "rgb(103, 191, 92)", 
            "rgb(255, 158, 74)",
            "rgb(114, 158, 206)",];
    this.colors.reverse();
	this._createLinePlot();
	this._createScrubLine();
}

_.extend(FeasibilityPlot.prototype, {
	_createLinePlot: function() {
		this.x = d3.scale.linear()
			.range([0, this.width]);

		this.y = d3.scale.linear()
			.range([this.height, 0])
            .nice();

		this.xAxis = d3.svg.axis()
		    .scale(this.x)
		    .ticks(0)
		    .orient("bottom");

		this.yAxis = d3.svg.axis()
		    .scale(this.y)
		    .ticks(0)
		    .orient("left");

        var sel = d3.select(this.selector)
        sel.append("div").text(this.title);

		this.svg = sel.append("svg")
				.attr("width", this.width + this.margin.left + this.margin.right)
				.attr("height", this.height + this.margin.top + this.margin.bottom)
			.append("g")
				.attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

		this.svg.append("g")
				.attr("class", "x axis")
				.attr("transform", "translate(0," + this.height + ")")
				.call(this.xAxis)
			// .append("text")
			// 	.attr("x", this.width/2)
			// 	.attr("y", 0)
			// 	.style("text-anchor", "middle")
			// 	.text(this.xLabel);


		this.svg.append("g")
				.attr("class", "y axis")
				.call(this.yAxis)
			.append("text")
				.attr("transform", "rotate(-90)")
			    .attr("y", -22)
			    .attr("x", this.height/2 * -1)
			    .style("text-anchor", "middle")
			    .text(this.yLabel);

		// this.svg.append("text")
  //   		.attr("x", this.width/ 2 )
  //   		.attr("y", -3)
  //   		.style("text-anchor", "middle")
  //           .style("font-size", "1.3em")
  //   		.text(this.title);

		this.xLinesGroup = this.svg.append("svg:g")
				.attr("class", "x-lines-group");

		this.constraintLinesGroup = this.svg.append("svg:g")
				.attr("class", "constraint-lines-group");
	},

	_createScrubLine: function() {
		this.scrubLine = this.svg.append("svg:line")
			.attr("class", "scrubLine")
			.attr("x1", 0)
			.attr("x2", 0)
			.attr("y1", 0)
			.attr("y2", this.height)
	},

	setConstraints: function(min, max) {
		var self = this;
		this.upperConstraint = max;
		this.lowerConstraint = min;
		if (this.constraintLines) {
    		this.constraintLines.remove();
    	}

		this.constraintLines = this.constraintLinesGroup.selectAll(".constraintLine")
			.data([min, max])
		.enter().append("svg:line")
			.attr("class", "constraintLine")
			.attr("x1", 0).attr("x2", this.width)
			.attr("y1", function(d) { return self.y(d) })
			.attr("y2", function(d) { return self.y(d) })
		var y_max = this.upperConstraint + this.upperConstraint * .1;
    	var y_min = this.lowerConstraint >= 0? this.lowerConstraint - this.lowerConstraint * .1 : this.lowerConstraint + this.lowerConstraint * .1;
    	this._setYAxis(y_min, y_max);

	},

	setScrubLinePosition: function(xPos) {
		this.scrubLine.attr("x1", this.x(xPos)).attr("x2", this.x(xPos));
	},

	setLegend: function(legendText) {
        console.log("SKIPPING ON LEGEND TEXT");
        return true;

		var self = this;
		var yPos = this.height + 30;

		this.legend = this.svg.append("g")
			.attr("class", "legend")
			.attr("x", 0)
			.attr("y", yPos)
			.attr("height", 10)
			.attr("width", this.width)

		var prevRecOffset = 0;
      	this.legend.selectAll('rect')
      		.data(legendText)
      		.enter().append("rect")
	  		.attr("x", function(d, i){ 
	  			var prevTextLen = 0;
	  			if(i > 0)
	  				prevTextLen = legendText[i-1].length;
	  			prevRecOffset = i == 0 ? 0 : prevRecOffset + prevTextLen * 5 + 15;
	  			return prevRecOffset;
	  		})
      		.attr("y", yPos)
	  		.attr("width", 10)
	  		.attr("height", 10)
	  		.style("fill", function(d, i) { return self.colors[i];})

	  	var prevOffset = 0;
	  	this.legend.selectAll('text')
      		.data(legendText)
      		.enter().append("text")
	  		.attr("x", function(d, i){
	  			var prevTextLen = 0;
	  			if(i > 0)
	  				prevTextLen = legendText[i-1].length;
	  			prevOffset = i == 0 ? 12 : prevOffset + prevTextLen * 5 + 15;
	  			return prevOffset;
	  		})
      		.attr("y", yPos + 10)
	  		.text(function(d) {
        		return d;
      		});

	},

	setXAxis: function(unsampled_x_arr) {
		this.x.domain([unsampled_x_arr[0], unsampled_x_arr[unsampled_x_arr.length - 1]]);
		this.xAxis.ticks(6);

		this.svg.select(".x.axis")
            .call(this.xAxis);

		var self = this;
		if (this.xLines) {
    		this.xLines.remove();
    	}

    	this.xLines = this.xLinesGroup.selectAll(".xline")
				.data(unsampled_x_arr)
				.enter().append("svg:line")
				.attr("class", "xLine")
				.attr("x1", function(d) { return self.x(d) })
				.attr("x2", function(d) { return self.x(d) })
				.attr("y1", 0).attr("y2", this.height)

	},

	grayOut: function() {
		this.svg.selectAll(".line").style("stroke", "gray");
		if (this.constraintLines)
			this.constraintLines.style("stroke", "gray");
		this.scrubLine.style("stroke", "gray");
		if (this.legend) {
			this.legend.selectAll("rect").style("fill", "gray");
		}
	},

	_ungrayOut: function() {
		var self = this;
		if (this.constraintLines)
			this.constraintLines.style("stroke", "red");
		this.scrubLine.style("stroke", "blue");
		if (this.legend) {
			this.legend.selectAll("rect").style("fill", function(d, i) { return self.colors[i];});
		}
	},

	_setYAxis: function(y_min, y_max) {
		var self = this;
		this.y.domain([Math.floor(y_min), Math.ceil(y_max)]);
		var numTicks = 6;
		this.yAxis.ticks(numTicks);

        this.svg.select(".y.axis")
            .call(this.yAxis);

        this.svg.select(".x.axis")
        	.attr("transform", "translate(0," + this.y(0) + ")")
			.call(this.xAxis)
		if (this.constraintLines)
			this.constraintLines
				.attr("y1", function(d) { return self.y(d) })
				.attr("y2", function(d) { return self.y(d) })
	},

	setData: function(x_arr, y_arrs) {
		this._ungrayOut();
		var self = this;
		var y_max = d3.max(y_arrs, function(array) {
		  	return d3.max(array);
		});	
		var y_min = d3.min(y_arrs, function(array) {
  			return d3.min(array);
		});

		if (y_max < this.upperConstraint)
			y_max = this.upperConstraint + this.upperConstraint * .1;

		if (y_min > this.lowerConstraint)
			y_min = this.lowerConstraint >= 0? this.lowerConstraint - this.lowerConstraint * .1 : this.lowerConstraint + this.lowerConstraint * .1;

		this._setYAxis(y_min, y_max);

		var line = d3.svg.line()
    		.interpolate("linear")
    		.x(function(d, i) { return self.x(x_arr[i]); })
    		.y(this.y);

    	if (this.lines == undefined) {
    		this.lines = this.svg.selectAll(".line")
    			.data(y_arrs)
    		.enter().append("path")
    			.attr("class", "line")
    			.attr("d", line)
    			.style("stroke", function(d, i) { return self.colors[i]; });
    	} else {
    		this.lines
    			.data(y_arrs)
    			.attr("d", line)
    			.style("stroke", function(d, i) { return self.colors[i]; });
    	}

	},
});

return FeasibilityPlot;

});