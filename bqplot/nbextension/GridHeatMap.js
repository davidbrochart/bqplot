/* Copyright 2015 Bloomberg Finance L.P.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

define(["./d3", "./Mark", "./utils"], function(d3, MarkViewModule, utils) {
    "use strict";

    var GridHeatMap = MarkViewModule.Mark.extend({
        render: function() {
            var base_render_promise = GridHeatMap.__super__.render.apply(this);
            var that = this;

            // TODO: create_listeners is put inside the promise success handler
            // because some of the functions depend on child scales being
            // created. Make sure none of the event handler functions make that
            // assumption.
            this.after_displayed(function() {
                this.parent.tooltip_div.node().appendChild(this.tooltip_div.node());
                this.create_tooltip();
            });

            this.selected_style = this.model.get("selected_style");
            this.unselected_style = this.model.get("unselected_style");
            this.display_el_classes = ["heatmapcell"];
            return base_render_promise.then(function() {
                that.event_listeners = {};
                that.process_interactions();
                that.create_listeners();
				that.compute_view_padding();
                that.draw();
            });
        },
        set_ranges: function() {
            var row_scale = this.scales["row"];
            if(row_scale) {
                // The y_range is reversed because we want the first row
                // to start at the top of the plotarea and not the bottom.
                var row_range = this.parent.padded_range("y", row_scale.model);
                row_scale.set_range(row_range);
                // row_scale.set_range([row_range[1], row_range[0]]);
            }
            var col_scale = this.scales["column"];
            if(col_scale) {
                col_scale.set_range(this.parent.padded_range("x", col_scale.model));
            }
        },
        set_positional_scales: function() {
            var x_scale = this.scales["column"], y_scale = this.scales["row"];
            this.listenTo(x_scale, "domain_changed", function() {
                if (!this.model.dirty) { this.draw(); }
            });
            this.listenTo(y_scale, "domain_changed", function() {
                if (!this.model.dirty) { this.draw(); }
            });
        },
        initialize_additional_scales: function() {
            var color_scale = this.scales["color"];
            if(color_scale) {
                this.listenTo(color_scale, "domain_changed", function() {
                    this.update_style();
                });
                color_scale.on("color_scale_range_changed", this.update_style, this);
            }
        },
        expand_scale_domain: function(scale, data, mode, start) {
            // This function expands the domain so that the heatmap has the
            // minimum area needed to draw itself.
            if(mode === "expand_one") {
                var current_pixels = data.map(function(el)
                                        {
                                            return scale.scale(el);
                                        });
                var diffs = current_pixels.slice(1).map(function(el, index) {
                                            return el - current_pixels[index];
                                        });
                //TODO: Explain what is going on here.
                if(diffs[0] < 0) {
                    start = !(start);
                }
                var min_diff = d3.min(diffs);
                var new_pixel = 0;
                if(start) {
                    new_pixel = current_pixels[current_pixels.length - 1] + min_diff;
                    return [data[0], scale.invert(new_pixel)];
                } else {
                    new_pixel = current_pixels[0] - min_diff;
                    return [scale.invert(new_pixel), data[current_pixels.length - 1]];
                }
            } else if(mode === "expand_two") {
                var current_pixels = data.map(function(el)
                                        {
                                            return scale.scale(el);
                                        });
                var min_diff = d3.min(current_pixels.slice(1).map(function(el, index) {
                                            return el - current_pixels[index];
                                        }));
                var new_end = current_pixels[current_pixels.length - 1] + min_diff;
                var new_start = current_pixels[0] - min_diff;
                return [scale.invert(new_start), scale.invert(new_end)];
            }
        },
        create_listeners: function() {
            GridHeatMap.__super__.create_listeners.apply(this);
            this.listenTo(this.model, "change:stroke", this.update_stroke, this);
            this.listenTo(this.model, "change:opacity", this.update_opacity, this);

            this.el.on("mouseover", _.bind(function() { this.event_dispatcher("mouse_over"); }, this))
                .on("mousemove", _.bind(function() { this.event_dispatcher("mouse_move");}, this))
                .on("mouseout", _.bind(function() { this.event_dispatcher("mouse_out");}, this));

            this.listenTo(this.model, "change:tooltip", this.create_tooltip, this);
            this.listenTo(this.parent, "bg_clicked", function() {
                this.event_dispatcher("parent_clicked");
            });
            this.listenTo(this.model, "change:selected", this.update_selected);
            /*
             *            // FIXME: multiple calls to update_path_style. Use on_some_change.
            this.listenTo(this.model, "change:interpolation", this.update_path_style, this);
            this.listenTo(this.model, "change:close_path", this.update_path_style, this);

            // FIXME: multiple calls to update_style. Use on_some_change.
            this.listenTo(this.model, "change:colors", this.update_style, this);
            this.listenTo(this.model, "change:fill", this.update_style, this);
            this.listenTo(this.model, "change:opacity", this.update_style, this);
            this.listenTo(this.model, "data_updated", this.draw, this);
            this.listenTo(this.model, "change:stroke_width", this.update_stroke_width, this);
            this.listenTo(this.model, "change:labels_visibility", this.update_legend_labels, this);
            this.listenTo(this.model, "change:line_style", this.update_line_style, this);
            this.listenTo(this.model, "change:interactions", this.process_interactions);

           */
        },
        update_selected: function(model, value) {
            this.selected_indices = value;
            this.apply_styles();
        },
        set_style_on_elements: function(style, indices) {
            // If the index array is undefined or of length=0, exit the
            // function without doing anything
            if(!indices || indices.length === 0) {
                return;
            }
            // Also, return if the style object itself is blank
            if(Object.keys(style).length === 0) {
                return;
            }
            var elements =this._filter_cells_by_index(indices);
            elements.style(style);
        },
        set_default_style: function(indices) {
            // For all the elements with index in the list indices, the default
            // style is applied.
            //

            if(!indices || indices.length === 0) {
                return;
            }
            var elements = this._filter_cells_by_index(indices);
            var stroke = this.model.get("stroke");
            var opacity = this.model.get("opacity");
            var that = this;

            elements.style("fill", function(d) {
                 return that.get_element_fill(d);
              })
              .style("opacity", opacity)
              .style("stroke", stroke);
        },
        clear_style: function(style_dict, indices) {
            // Function to clear the style of a dict on some or all the elements of the
            // chart.If indices is null, clears the style on all elements. If
            // not, clears on only the elements whose indices are mathcing.
            //
            // This function is not used right now. But it can be used if we
            // decide to accomodate more properties than those set by default.
            // Because those have to cleared specifically.
            //
            if(Object.keys(style_dict).length === 0) {
                // No style to clear
                return;
            }

            var elements = this.display_cells;
            if(indices) {
                elements = this._filter_cells_by_index(indices);
            }
            var clearing_style = {};
            for(var key in style_dict) {
                clearing_style[key] = null;
            }
            elements.style(clearing_style);
        },
        _filter_cells_by_index :function(indices, cells_subset) {
            if(cells_subset === undefined || cells_subset === null) {
                cells_subset = this.display_cells;
            }
            var filtered_cells = cells_subset.filter(function(data) {
                var arr = [data['row_num'], data['column_num']];
                for(var iter in indices) {
                    if(_.isEqual(arr, indices[iter])) {
                        return true;
                    }
                }
                return false;
            });
            return filtered_cells;
        },
        unselected_style_updated: function(model, style) {
            this.unselected_style = style;
            var sel_indices = this.selected_indices;
            var all_indices = _.flatten(row_nums.map(function(row) { return col_nums.map(function(col) { return [row, col]; }); }));
            var that = this;
            var unselected_indices = (!this.selected_indices) ? all_indices
                                     : all_indices.filter(function(index) {
                                        for(var selected_iter in that.selected_indices) {
                                            if(_.isEqual(index, that.selected_indices[selected_iter]))
                                                return false;
                                        }
                                        return true;
                                    });
            this.clear_style(model.previous("unselected_style"), unselected_indices);
            this.style_updated(style, unselected_indices);
        },
        apply_styles: function() {
            var row_nums = _.range(this.model.colors.length);
            var col_nums = _.range(this.model.colors[0].length);

            // generating all indices which is the cartesian product of the
            // row_nums and col_nums.
            var all_indices = _.flatten(row_nums.map(function(row) { return col_nums.map(function(col) { return [row, col]; }); }), true);
            this.clear_style(this.selected_style);
            this.clear_style(this.unselected_style);

            this.set_default_style(all_indices);
            var that = this;
            this.set_style_on_elements(this.selected_style, this.selected_indices);
            var unselected_indices = (!this.selected_indices) ? []
                                     : all_indices.filter(function(index) {
                                        for(var selected_iter in that.selected_indices) {
                                            if(_.isEqual(index, that.selected_indices[selected_iter]))
                                                return false;
                                        }
                                        return true;
                                    });
            this.set_style_on_elements(this.unselected_style, unselected_indices);
        },
        relayout: function() {
            this.set_ranges();
            this.compute_view_padding();
            //TODO: The call to draw has to be changed to something less
            //expensive.
            this.draw();
        },
        invert_point: function(pixel) {
            // For now, an index selector is not supported for the heatmap
        },
        invert_range: function(start_pxl, end_pxl) {
            if(start_pxl === undefined || end_pxl === undefined) {
                this.model.set("selected", null);
                this.touch();
                return [];
            }

            var self = this;
            var x_scale = this.scales["column"];
            var that = this;
            var column_indices = _.range(this.model.colors.length);

            var that = this;
            var selected = _.filter(column_indices, function(index) {
                var elem = that.column_pixels[index];
                return (elem >= start_pxl && elem <= end_pxl);
            });
            var rows = _.range(this.model.colors.length);
            selected = selected.map(function(s) { return rows.map(function(r) { return [r, s]; }); });
            selected = _.flatten(selected, true);
            this.model.set("selected", selected);
            this.touch();
        },
        invert_2d_range: function(x_start, x_end, y_start, y_end) {
            //y_start is usually greater than y_end as the y_scale is invert
            //by default
            if(!x_end) {
                this.model.set("selected", null);
                this.touch();
                return _.range(this.model.mark_data.length);
            }
            var x_scale = this.scales["column"], y_scale = this.scales["row"];
            var y_min = d3.min([y_start, y_end]);
            var y_max = d3.max([y_start, y_end]);

            var col_indices = _.range(this.model.colors[0].length);
            var row_indices = _.range(this.model.colors.length);
            var that = this;
            var sel_cols = _.filter(col_indices, function(index) {
                var elem_x = that.column_pixels[index];
                return (elem_x >= x_start && elem_x <= x_end);
            });
            var sel_rows = _.filter(row_indices, function(index) {
                var elem_y = that.row_pixels[index];
                return (elem_y <= y_max && elem_y >= y_min);
            });
            var selected = sel_cols.map(function(s) { return sel_rows.map(function(r) { return [r, s]; }); });
            selected = _.flatten(selected, true);
            this.model.set("selected", selected);
            this.touch();
            return selected;
        },
        draw: function() {
            this.set_ranges();

            var that = this;
            var num_rows = this.model.colors.length;
            var num_cols = this.model.colors[0].length;

            var row_scale = this.scales["row"];
            var column_scale = this.scales["column"];

            var row_start_aligned = this.model.get("row_align") === "start";
            var col_start_aligned = this.model.get("column_align") === "start";

            if(this.model.modes["row"] !== "middle" && this.model.modes["row"] !== "boundaries") {
                var new_domain = this.expand_scale_domain(row_scale, this.model.rows, this.model.modes["row"], row_start_aligned);
                if(d3.min(new_domain) < d3.min(row_scale.model.domain) || d3.max(new_domain) > d3.max(row_scale.model.domain)) {
                    // Update domain if domain has changed
                    row_scale.model.compute_and_set_domain(new_domain, row_scale.model.id);
                }
            }

            if(this.model.modes["column"] !== "middle" && this.model.modes["column"] !== "boundaries") {
                var new_domain = this.expand_scale_domain(column_scale, this.model.columns, this.model.modes["column"], col_start_aligned);
                if(d3.min(new_domain) < d3.min(column_scale.model.domain) || d3.max(new_domain) > d3.max(column_scale.model.domain)) {
                    // Update domain if domain has changed
                    column_scale.model.compute_and_set_domain(new_domain, column_scale.model.id);
                }
            }

            var row_plot_data = this.get_tile_plotting_data(row_scale, this.model.rows, this.model.modes["row"], row_start_aligned);
            var column_plot_data = this.get_tile_plotting_data(column_scale, this.model.columns, this.model.modes["column"], col_start_aligned);

            this.row_pixels = row_plot_data['start'];
            this.column_pixels = column_plot_data['start'];

            this.display_rows = this.el.selectAll(".heatmaprow")
                .data(_.range(num_rows));
            this.display_rows.enter().append("g")
                .attr("class", "heatmaprow");
            this.display_rows
                .attr("transform", function(d)
                                    {
                                        return "translate(0, " + row_plot_data['start'][d] + ")";
                                    });

            var col_nums = _.range(num_cols);
            this.display_cells = this.display_rows.selectAll(".heatmapcell")
                .data(function(d, i) { return col_nums.map(function(ind)
                                        {
                                            return that.model.mark_data[i*num_rows+ind];
                                        });
                                     });
            this.display_cells.enter()
                .append("rect")
                .attr("class", "heatmapcell")
                .on("click", _.bind(function() {
                    this.event_dispatcher("element_clicked");
                }, this));

            var stroke = this.model.get("stroke");
            var opacity = this.model.get("opacity");
            this.display_cells
                .attr({"x": function(d, i)
                             {
                                return column_plot_data['start'][i];
                             },
                       "y": 0})
                .attr("width", function(d, i) { return column_plot_data['widths'][i];})
                .attr("height",function(d) { return row_plot_data['widths'][d['row_num']];})
                .style("fill", function(d) { return that.get_element_fill(d); })
                .style({"stroke" : stroke,
                        "opacity" : opacity});
        },
        update_stroke: function(model, value) {
            this.display_cells.style("stroke", value);
        },
        update_opacity: function(model, value) {
            this.display_cells.style("opacity", value);
        },
        get_tile_plotting_data(scale, data, mode, start) {
            // This function returns the starting points and widths of the
            // cells based on the parameters passed.
            //
            // scale is the scale and data is the data for which the plot data
            // is to be generated. mode refers to the expansion of the data to
            // generate the plotting data and start is a boolean indicating the
            // alignment of the data w.r.t the cells.
            var reversed_scale = false;
            var start_points = [];
            var widths = [];
            if(mode === "middle") {
                start_points = data.map(function(d) { return scale.scale(d); });
                widths = data.map(function(d) { return scale.scale.rangeBand(); });

                return {'start': start_points, 'widths': widths};
            }
            if(mode === "boundaries") {
                start_points = data.slice(0, -1).map(function(d)
                                {
                                    return scale.scale(d);
                                });
                widths = start_points.slice(1).map(function(d, ind)
                            {
                                 return Math.abs(d - start_points[ind]);
                            });
                widths[widths.length] = scale.scale(data.slice(-1)[0]) - start_points.slice(-1)[0];
                return {'start': start_points, 'widths': widths};
            }
            if(mode === "expand_one") {
                if(start) {
                    // Start points remain the same as the data.
                    start_points = data.map(function(d) {
                        return scale.scale(d);
                    });
                    widths = start_points.slice(1).map(function(d, ind) {
                        // Absolute value is required as the order of the data
                        // can be increasing or decreasing in terms of pixels
                        return Math.abs(d - start_points[ind]);
                    });
                    // Now we have n-1 widths. We have to add the last width.
                    var bounds = d3.max(scale.scale.range());
                    widths = Array.prototype.concat(widths, [Math.abs(bounds - d3.max(start_points))]);
                } else {
                    start_points = data.map(function(d) {
                        return scale.scale(d);
                    });
                    widths = start_points.slice(1).map(function(d, ind) {
                        // Absolute value is required as the order of the data
                        // can be increasing or decreasing in terms of pixels
                        return Math.abs(d - start_points[ind]);
                    });
                    var bounds = d3.min(scale.scale.range());
                    if(start_points[1] > start_points[0]) {
                        // The point corresponding to the bounds is added at
                        // the start of the array. Hence it has to be added to
                        // the start_points and the last start_point can be
                        // removed.
                        start_points.splice(0, 0, Math.abs(0, 0, bounds));
                        widths.splice(0, 0, start_points[1] - start_points[0]);
                        start_points.splice(-1, 1);
                    } else {
                        // The point for the bounds is added to the end of the
                        // array. The first start point can now be removed as
                        // this will be the last end point.
                        widths = Array.prototype.concat(widths, [Math.abs(bounds - start_points.slice(-1)[0])]);
                        start_points = Array.prototype.concat(start_points, bounds);
                        start_points.splice(0, 1);
                    }
                }
                return {'widths': widths, 'start': start_points};
            }
            if(mode === "expand_two") {
                start_points = data.map(function(d)
                                {
                                    return scale.scale(d);
                                });

                var is_positive = (start_points[1] - start_points[0]) > 0;
                var bound = (is_positive) ? d3.min(scale.scale.range()) : d3.max(scale.scale.range());
                start_points.splice(0, 0, bound);
                widths = start_points.slice(1).map(function(d, ind)
                            {
                                return Math.abs(d - start_points[ind]);
                            });
                bound = (is_positive) ? d3.max(scale.scale.range()) : d3.min(scale.scale.range());
                widths[widths.length] = Math.abs(bound - start_points.slice(-1)[0]);
                return {'start': start_points, 'widths': widths};
            }
        },
        get_element_fill: function(dat) {
            return this.scales['color'].scale(dat['color']);
        },
        process_interactions: function() {
            var interactions = this.model.get("interactions");
            if(_.isEmpty(interactions)) {
                //set all the event listeners to blank functions
                this.reset_interactions();
            } else {
                if(interactions["click"] !== undefined &&
                  interactions["click"] !== null) {
                    if(interactions["click"] === "tooltip") {
                        this.event_listeners["element_clicked"] = function() {
                            return this.refresh_tooltip(true);
                        };
                        this.event_listeners["parent_clicked"] = this.hide_tooltip;
                    }
                } else {
                    this.reset_click();
                }
                if(interactions["hover"] !== undefined &&
                  interactions["hover"] !== null) {
                    if(interactions["hover"] === "tooltip") {
                        this.event_listeners["mouse_over"] = this.refresh_tooltip;
                        this.event_listeners["mouse_move"] = this.show_tooltip;
                        this.event_listeners["mouse_out"] = this.hide_tooltip;
                    }
                } else {
                    this.reset_hover();
                }
            }
        },
    });

    return {
        GridHeatMap: GridHeatMap,
    };
});

