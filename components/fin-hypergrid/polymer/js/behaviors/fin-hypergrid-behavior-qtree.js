/* global numeral */
'use strict';
/**
 *
 * @module behaviors\qtree
 * @description
 fin-hypergrid-behavior-qtree is a datasource based on an external Q data source with tree-centric analytic capilities
<br>See [kx.com](http://www.kx.com)
<br>See steve apters [hypertree](https://github.com/stevanapter/hypertree) project
 *
 */



(function() {

    var noop = function() {};
    var logMessages = true;
    var hierarchyColumn = 'g_';

    //keys mapping Q datatypes to aligment and renderers are setup here.
    //<br>see [q datatypes](http://code.kx.com/wiki/Reference/Datatypes) for more.

    var typeAlignmentMap = {
        j: 'right',
        s: 'left',
        t: 'center',
        f: 'right',
        i: 'right',
        e: 'right',
        d: 'center'
    };

    //there are 4 default cell renderer types to choose from at the moment
    //<br>simpleCellRenderer, sliderCellRenderer, sparkbarCellRenderer, sparklineCellRenderer
    // var typeRendererMap = {
    //     J: 'sparklineCellRenderer',
    //     j: 'simpleCellRenderer',
    //     s: 'simpleCellRenderer',
    //     t: 'simpleCellRenderer',
    //     f: 'simpleCellRenderer',
    //     d: 'simpleCellRenderer'
    // };

    var icommify = function(v) {
        if (v) {
            return numeral(v).format('0,0');
        } else if (v === 0) {
            return '0';
        } else {
            return '';
        }
    };

    var fcommify = function(v) {
        if (v) {
            return numeral(v).format('0,0.00');
        } else if (v === 0) {
            return '0.00';
        } else {
            return '';
        }
    };

    var typeFormatMap = {
        J: function(v) {
            return v;
        },
        j: icommify,
        s: function(v) {
            return v;
        },
        t: function(v) {
            return v;
        },
        e: fcommify,
        i: icommify,
        f: fcommify,
        d: function(v) {
            return v;
        }
    };

    //this will map will ultimately be user editable and persisted
    //it maps an alias from the Q data world to behavior, formatting and look and feel
    var propertiesMap = {
        columns: {
            TEST: {
                formatter: fcommify,
                alignment: 'right',
                modifyConfig: function(cell) {
                    noop(cell);
                }
            },
            USD: {
                formatter: fcommify,
                alignment: 'right',
                modifyConfig: function(cell) {
                    cell.config.fgColor = 'green'; //#1C4A16'; //'#53FF07'; //green
                    if (cell.config.value < 0) {
                        cell.config.fgColor = 'red'; //#C13527'; //'#FF1515'; //red
                    }
                }
            },
            VOL: {
                formatter: function(v) {
                    if (v) {
                        var result = numeral(v).format('0.000a');
                        return result;
                    } else {
                        return v;
                    }
                },
                alignment: 'right',
                modifyConfig: function(cell) {
                    cell.config.fgColor = '#669203'; //'#53FF07'; //green
                    if (cell.config.value < 0) {
                        cell.config.fgColor = '#C13527'; //'#FF1515'; //red
                    }
                }
            }
        }
    };


    //sort states are also the visual queues in the column headers
    //* '' no sort
    //* ↑ sort ascending
    //* ↓ sort descending
    //* ⤒ sort absolute value ascending
    //* ⤓ sort absolute value descending;
    // \u25be

    var sortMap = {
        a: '-up',
        d: '-down',
        A: '-abs-up',
        D: '-abs-down',
    };

    var sortStates = {
        n: 'a',
        a: 'd',
        d: 'A',
        A: 'D',
    };

    var imageMap = {
        u: 'up-rectangle',
        d: 'down-rectangle',
        '': 'rectangle-spacer'
    };

    Polymer({ /* jslint ignore:line */

        /**
         * @function
         * @instance
         * @description
         the function to override for initialization
         */
        ready: function() {
            this.block = {
                O: {
                    columns: {}
                },
                N: 0,
                F: [],
                G: [],
                S: {
                    cols: [],
                    rows: []
                },
                Z: [{
                    g_: ['']
                }]
            };
            this.readyInit();
            this.sorted = {};
            this.ws = null;
            this.reconnect();
            this.msgCounter = Date.now();
            this.msgResponsesActions = {};

            var cursorChanger = function(grid, event) {
                if (this.isTopLeft(grid, event)) {
                    this.cursor = 'pointer';
                } else {
                    this.cursor = null;
                }
                if (this.next) {
                    this.next.handleMouseMove(grid, event);
                }
            };
            var self = this;
            setTimeout(function() {
                self.featureChain.handleMouseMove = cursorChanger;
                cursorChanger.bind(self.featureChain);
            }, 500);

        },

        /**
         * @function
         * @instance
         * @description
         return the count of fixed rows
         * #### returns: integer
         */
        getFixedRowCount: function() {
            return 2;
        },

        /**
         * @function
         * @instance
         * @description
         you can override this function and substitute your own cell provider
         * #### returns: [fin-hypergrid-cell-provider](module-._cell-provider.html)
         */
        createCellProvider: function() {
            var self = this;
            var provider = document.createElement('fin-hypergrid-cell-provider');
            var columns = propertiesMap.columns;
            provider.getCell = function(config) {
                var cell = provider.cellCache.simpleCellRenderer;
                cell.config = config;
                var colId = self.block.F[config.x];
                var type = self.block.Q[colId];
                var colProps;
                var colPropertyAlias = self.block.O.columns[colId];
                if (colPropertyAlias) {
                    colProps = columns[colPropertyAlias];
                    colProps.modifyConfig(cell);
                }
                var formatter = colProps ? colProps.formatter : typeFormatMap[type] || function(v) {
                    return v;
                };
                config.value = formatter(config.value);
                return cell;
            };
            provider.getFixedColumnCell = function(config) {
                var cell = provider.cellCache.treeCellRenderer;
                cell.config = config;
                return cell;
            };
            provider.getFixedRowCell = function(config) {
                var label = provider.cellCache.simpleCellRenderer;
                label.config = config;
                if (config.y === 1) {
                    config.value = config.value[0];
                    return provider.getCell(config);
                }
                config.value = config.value || '';
                return label;
            };

            provider.getTopLeftCell = function(config) {
                //var empty = provider.cellCache.emptyCellRenderer;
                var label = provider.cellCache.simpleCellRenderer;
                label.config = config;
                if (config.y === 0) {
                    return label;
                } else {
                    return label;
                }
            };

            return provider;
        },

        /**
        * @function
        * @instance
        * @description
        connect to q at newUrl
        * @param {string} newUrl - the url of the q server
        */
        connectTo: function(newUrl) {
            noop(newUrl);
            // this.setAttribute('url', newUrl);
            // this.reconnect();
        },

        /**
        * @function
        * @instance
        * @description
        try reconnecting
        */
        reconnect: function() {
            this.url = this.getAttribute('url');
            if (!this.url) {
                return;
            }
            this.connect();
            this.scrollPositionY = 0;
            this.scrolled = false;
        },

        /**
         * @function
         * @instance
         * @description
         return the value at x,y for the top left section of the hypergrid
         * #### returns: Object
         * @param {integer} x - x coordinate
         * @param {integer} y - y coordinate
         */
        getTopLeftValue: function(x, y) {
            if (y === 0) {
                var image = this.getClickIndicator(hierarchyColumn);
                var clone = [image, 'Hierarchy', this.getSortIndicator(hierarchyColumn)];
                //clone[0] = clone[0] + ' ' + sortIndicator;
                return clone;
            } else {
                if (this.isColumnReorderable()) {
                    return [this.getImage('collapse-all'), '®', this.getImage('expand-all')];
                } else {
                    return '®';
                }
            }
        },

        /**
         * @function
         * @instance
         * @description
         return the data value at coordinates x,y.  this is the main "model" function that allows for virtualization
         * #### returns: Object
         * @param {integer} x - the x coordinate
         * @param {integer} y - the y coordinate
         */
        getValue: function(x, y) {
            var col = this.getColumnId(x);
            var normalized = Math.floor(y - this.scrollPositionY);
            if (this.block && (typeof col === 'string')) {
                var val = this.block.Z[1][col][normalized];
                if (val || val === 0) {
                    return val;
                }
            }
            return '';
        },

        /**
        * @function
        * @instance
        * @description
        empty out our page of local data, this function is used when we lose connectivity.  this function is primarily used as a visual queue so the user doesn't see stale data
        */
        clearData: function() {
            this.block.rows = [];
            this.changed();
        },

        /**
         * @function
         * @instance
         * @description
         return the number of rows
         * #### returns: integer
         */
        getRowCount: function() {
            return Math.max(0, this.block.N - 1);
        },

        /**
         * @function
         * @instance
         * @description
         return the total number of columns.  Virtual column scrolling is not necessary with this GridBehavior because we only hold a small amount of vertical data in memory and most tables in Q are timeseries financial data meaning the are very tall and skinny.  We know all the columns from the first page from Q.
         * #### returns: integer
         */
        getColumnCount: function() {
            return this.block.F.length;
        },

        /**
         * @function
         * @instance
         * @description
         quietly set the scroll position in the horizontal dimension
         * #### returns: type
         * @param {integer} y - the position in pixels
         */
        setScrollPositionY: function(y) {
            if (this.scrollPositionY === y) {
                return;
            }
            this.scrollPositionY = y;
            if (!this.isConnected()) {
                return;
            }
            var startY = this.scrollPositionY || 0;
            var stopY = startY + 60;
            this.sendMessage({
                id: this.getNextMessageId(),
                fn: 'get',
                start: startY,
                end: stopY
            });
        },

        /**
        * @function
        * @instance
        * @description
        return true if we are connected to q
        * #### returns: boolean
        */
        isConnected: function() {
            if (!this.ws) {
                return false;
            }
            return this.ws.readyState === this.ws.OPEN;
        },

        /**
         * @function
         * @instance
         * @description
         return the data value at point x,y in the fixed row area
         * #### returns: Object
         * @param {integer} x - x coordinate
         * @param {integer} y - y coordinate
         */
        getFixedRowValue: function(x, y) {
            var colId = this.getColumnId(x);
            if (y < 1) {
                var sortIndicator = this.getSortIndicator(colId);
                var clickIndicator = this.getClickIndicator(colId);
                return [clickIndicator, colId, sortIndicator];
            }
            var total = this.block.Z[0][colId];
            return total;
        },

        /**
        * @function
        * @instance
        * @description
        return the click indicator image for a colId
        * #### returns: HTMLImageElement
        * @param {string} colId - the column id of interest
        */
        getClickIndicator: function(colId) {
            var direction = this.block.C[colId];
            var image = this.getImage(imageMap[direction]);
            return image;
        },

        /**
        * @function
        * @instance
        * @description
        return the sort indicator image for a colId
        * #### returns: HTMLImageElement
        * @param {string} colId - the column id of interest
        */
        getSortIndicator: function(colId) {
            var sortIndex = this.block.S.cols.indexOf(colId);
            if (sortIndex < 0) {
                return this.getImage('sortable');
            }
            var sortState = this.block.S.sorts[sortIndex];
            var symbol = (sortIndex + 1) + sortMap[sortState];
            var state = this.getImage(symbol);
            return state;
        },

        /**
         * @function
         * @instance
         * @description
         return the value at x,y for the fixed row area
         * #### returns: Object
         * @param {integer} x - x coordinate
         * @param {integer} y - y coordinate
         */
        getFixedColumnValue: function(x, y) {
            var indentPixels = 10;
            var blob = this.block.Z[1];
            var transY = Math.max(0, y - this.scrollPositionY);
            var data = blob.g_[transY];
            var level = blob.l_[transY];
            var indent = 5 + indentPixels + (level - 1) * indentPixels;
            var icon = '';
            if (!blob.e_[transY]) {
                icon = blob.o_[transY] ? '\u25be ' : '\u25b8 ';
            }
            return {
                data: data,
                indent: indent,
                icon: icon
            };
        },

        /**
        * @function
        * @instance
        * @description
        returns true if we support sorting
        * #### returns: boolean
        */
        getCanSort: function() {
            return true;
        },

        /**
         * @function
         * @instance
         * @description
         toggle the sort at columnIndex to it's next state
         * @param {integer} columnIndex - the column index of interest
         */
        toggleSort: function(columnIndex) {
            var colId = this.getColumnId(columnIndex);
            this._toggleSort(colId);
        },

        /**
         * @function
         * @instance
         * @description
         build our local q message with sorting details and fire it off to Q
         * @param {string} colId - the column of interest
         */
        _toggleSort: function(colId) {
            if (!this.getCanSort()) {
                return;
            }
            var sortBlob = this.block.S;
            var sortIndex = sortBlob.cols.indexOf(colId);

            //lets get the current state or 'n' if it doesn't exist yet
            var currentState = sortBlob.sorts[sortIndex] || 'n';

            //lets set to the next state or undefined
            var newState = sortStates[currentState];

            //remove this column from it's current order position
            if (sortIndex > -1) {
                sortBlob.cols.splice(sortIndex, 1);
                sortBlob.sorts.splice(sortIndex, 1);
            }

            //push to the front the new state
            if (newState) {
                sortBlob.cols.unshift(colId);
                sortBlob.sorts.unshift(newState);
            }

            //ony 3 nested sorts allowed for now
            sortBlob.cols.length = sortBlob.sorts.length = Math.min(3, sortBlob.cols.length);

            //lets tell Q now
            var msg = {
                id: this.getNextMessageId(),
                fn: 'sorts',
                cols: sortBlob.cols,
                sorts: sortBlob.sorts
            };

            this.sendMessage(msg);

        },

        /**
         * @function
         * @instance
         * @description
         get the view translated alignment at x,y in the fixed row area
         * #### returns: string ['left','center','right']
         * @param {integer} x - x coordinate
         * @param {integer} y - y coordinate
         */
        getFixedRowAlignment: function(x, y) {
            if (y > 0) {
                return this.getColumnAlignment(x);
            }
            return this.resolveProperty('fixedRowAlign');
        },

        /**
         * @function
         * @instance
         * @description
         return the column alignment at column x
         * #### returns: string ['left','center','right']
         * @param {integer} x - the column index of interest
         */
        getColumnAlignment: function(x) {
            var colId = this.getColumnId(x);
            var type = this.block.Q[colId];
            var colProps;
            var colPropertyAlias = this.block.O.columns[colId];
            if (colPropertyAlias) {
                colProps = propertiesMap.columns[colPropertyAlias];
            }
            var alignment = colProps ? colProps.alignment : typeAlignmentMap[type];
            return alignment;
        },

        /**
         * @function
         * @instance
         * @description
         return the columnId/label/fixedRowValue at x
         * #### returns: string
         * @param {integer} x - the view translated x index
         */
        getColumnId: function(x) {
            var headers = this.block.F;
            var col = headers[x];
            return col;
        },

        /**
         * @function
         * @instance
         * @description
         return the alignment at x for the fixed column area
         * #### returns: string ['left','center','right']
         * @param {integer} x - the fixed column index of interest
         */
        getFixedColumnAlignment: function( /* x */ ) {
            return 'left';
        },

        /**
         * @function
         * @instance
         * @description
         the top left area has been clicked, you've been notified
         * @param {fin-hypergrid} grid - [fin-hypergrid](module-._fin-hypergrid.html)
         * @param {Object} mouse - event details
         */
        topLeftClicked: function(grid, mouse) {
            var gridY = mouse.gridCell.y;
            if (gridY < 1) {
                this.hierarchyCellClicked(grid, mouse);
            } else {
                this.controlCellClick(grid, mouse);
            }
        },

        /**
         * @function
         * @instance
         * @description
         fixed column header has been clicked, you've been notified
         * @param {fin-hypergrid} grid - [fin-hypergrid](module-._fin-hypergrid.html)
         * @param {Object} mouse - event details
         */
        hierarchyCellClicked: function(grid, mouse) {
            var colId = hierarchyColumn;
            var colWidth = this.getFixedColumnWidth(0);
            var mouseX = mouse.mousePoint.x;
            var direction = this.block.C[hierarchyColumn];
            if (mouseX < (colWidth / 2)) {
                if (direction) {
                    var colClick = {
                        id: this.getNextMessageId(),
                        fn: 'col',
                        col: colId
                    };
                    this.sendMessage(colClick);
                } else {
                    return;
                }
            } else {
                this._toggleSort(colId);
            }
        },

        /**
         * @function
         * @instance
         * @description
         control cell has been clicked, you've been notified
         * @param {fin-hypergrid} grid - [fin-hypergrid](module-._fin-hypergrid.html)
         * @param {Object} mouse - event details
         */
        controlCellClick: function(grid, mouse) {
            var colWidth = this.getFixedColumnWidth(0);
            var mouseX = mouse.mousePoint.x;
            var fn = 'expand';
            if (mouseX < (colWidth / 3)) {
                fn = 'collapse';
            } else if (mouseX < (2 * colWidth / 3)) {
                fn = 'reset';
            }

            if (!this.isColumnReorderable()) {
                fn = 'reset';
            }

            var msg = {
                id: this.getNextMessageId(),
                fn: fn
            };
            this.sendMessage(msg);
        },
        /**
         * @function
         * @instance
         * @description
         fixed column has been clicked, you've been notified
         * @param {fin-hypergrid} grid - [fin-hypergrid](module-._fin-hypergrid.html)
         * @param {Object} mouse - event details
         */
        fixedColumnClicked: function(grid, mouse) {
            var rowNum = mouse.gridCell.y - this.scrollPositionY;
            var rows = this.block.Z[1].n_[rowNum];
            if (rows.length === this.block.G.length + 1) {
                //this is a leaf, don't send anything
                return;
            }
            var rowClick = {
                id: this.getNextMessageId(),
                fn: 'row',
                row: rows
            };
            this.sendMessage(rowClick);
        },

        /**
         * @function
         * @instance
         * @description
         fixed row has been clicked, you've been notified
         * @param {fin-hypergrid} grid - [fin-hypergrid](module-._fin-hypergrid.html)
         * @param {Object} mouse - event details
         */
        fixedRowClicked: function(grid, mouse) {
            var x = mouse.gridCell.x;
            var y = mouse.gridCell.y;
            if (y > 0) {
                return;
            }
            var colId = this.getColumnId(x);
            var direction = this.block.C[colId];
            var colWidth = this.getColumnWidth(x);
            var mousePoint = mouse.mousePoint.x;
            if (mousePoint < (colWidth / 2)) {
                if (direction) {
                    var colClick = {
                        id: this.getNextMessageId(),
                        fn: 'col',
                        col: colId
                    };
                    this.sendMessage(colClick);
                }
            } else {
                this.toggleSort(x);
            }
        },

        /**
         * @function
         * @instance
         * @description
         a specific cell was clicked, you've been notified
         * @param {rectangle.point} cell - point of cell coordinates
         * @param {Object} event - all event information
         */
        cellClicked: function(cell, event) {
            var rowNum = cell.y - this.scrollPositionY;
            var rows = this.block.Z[1].n_[rowNum];
            var colId = this.getColumnId(cell.x);
            var colClick = {
                id: this.getNextMessageId(),
                fn: 'cell',
                col: colId,
                row: rows
            };
            this.sendMessage(colClick);
            this.grid.fireCellClickEvent(cell, event);
        },

        /**
        * @function
        * @instance
        * @description
        set message to Q
        * @param {Object} message - a Q-centric well formed message
        */
        sendMessage: function(message) {
            if (logMessages) {
                console.log('out-' + Date.now(), message);
            }
            this.ws.send(JSON.stringify(message));
        },

        /**
         * @function
         * @instance
         * @description
         return true if we can re-order columns
         * #### returns: boolean
         */
        isColumnReorderable: function() {
            return this.block.V;
        },
        /**
         * @function
         * @instance
         * @description
         build and open the editor within the container div argument, this function should return false if we don't want the editor to open
         * #### returns: boolean
         * @param {HTMLDivElement} div - the containing div element
         */
        openEditor: function(div) {
            if (!this.isColumnReorderable) {
                return false;
            }
            var self = this;
            var container = document.createElement('div');

            var group = document.createElement('fin-hypergrid-dnd-list');
            var hidden = document.createElement('fin-hypergrid-dnd-list');
            var visible = document.createElement('fin-hypergrid-dnd-list');

            container.appendChild(group);
            container.appendChild(hidden);
            container.appendChild(visible);

            this.beColumnStyle(group.style);
            group.style.left = '0%';
            group.title = 'groups';
            group.list = this.block.G.slice(0);
            //can't remove the last item
            group.canDragItem = function(list, item, index, e) {
                noop(item, index, e);
                if (self.block.U) {
                    return list.length > 1;
                } else {
                    return true;
                }
            };
            //only allow dropping of H fields
            group.canDropItem = function(sourceList, myList, sourceIndex, item, e) {
                noop(sourceList, myList, sourceIndex, e);
                return self.block.H.indexOf(item) > -1;
            };

            this.beColumnStyle(hidden.style);
            hidden.style.left = '33.3333%';
            hidden.title = 'hidden columns';
            hidden.list = this.block.I.slice(0);

            this.beColumnStyle(visible.style);
            visible.style.left = '66.6666%';
            visible.title = 'visible columns';
            visible.list = this.block.F.slice(0);
            //can't remove the last item
            visible.canDragItem = function(list, item, index, e) {
                noop(item, index, e);
                return list.length > 1;
            };

            //attach for later retrieval
            div.lists = {
                group: group.list,
                hidden: hidden.list,
                visible: visible.list
            };

            div.appendChild(container);
            return true;
        },

        /**
         * @function
         * @instance
         * @description
         the editor is requesting close return true or false, and deal with the edits
         * @param {HTMLDivElement} div - the containing div element
         */
        closeEditor: function(div) {
            var lists = div.lists;
            var changeCols = {
                id: this.getNextMessageId(),
                fn: 'groups',
                groups: lists.group,
                visible: lists.visible
            };

            this.sendMessage(changeCols);
            return true;
        },

        /**
        * @function
        * @instance
        * @description
        generate a new unique message id
        * #### returns: string
        * @param {function} onResponseDo - this is the callback to associate with the message id
        */
        getNextMessageId: function(onResponseDo) {
            var id = 'js_' + this.msgCounter++;
            if (onResponseDo) {
                this.msgResponsesActions[id] = onResponseDo;
            }
            return id;
        },

        /**
         * @function
         * @instance
         * @description
         a dnd column has just been dropped, we've been notified
         */
        endDragColumnNotification: function() {
            var self = this;

            var visible = this.block.F.slice(0);
            for (var i = 0; i < visible.length; i++) {
                var transX = this.translateColumnIndex(i);
                visible[i] = this.getColumnId(transX);
            }
            var msgId = this.getNextMessageId(function(message) {
                //ignore any predecessor column swap results if a new one has been posted
                var colCount = self.getColumnCount();
                var widths = [];
                for (var i = 0; i < colCount; i++) {
                    widths[i] = self._getColumnWidth(i);
                }
                self.initColumnIndexes();
                for (i = 0; i < colCount; i++) {
                    widths[i] = self._setColumnWidth(i, widths[i]);
                }
                self.handleMessage(message);
            });
            var changeCols = {
                id: msgId,
                fn: 'groups',
                groups: this.block.G,
                visible: visible
            };

            this.sendMessage(changeCols);
            return true;
        },

        /**
        * @function
        * @instance
        * @description
        handle the message d
        * @param {Object} d - a q-centeric well formed message
        */
        handleMessage: function(d) {
            //insure certain things exist
            if (d.O && !d.O.columns) {
                d.O.columns = {};
            }

            this.block = d;
            if (!this.tableState.columnIndexes || this.tableState.columnIndexes.length === 0 || d.F.length !== this.tableState.columnIndexes.length) {
                this.initColumnIndexes();
            }
            //let's autosize the hierarchy column
            this.changed();
            this.autosizeHierarchyColumn();
        },

        /**
        * @function
        * @instance
        * @description
        try autosizing the hierarchy column
        */
        autosizeHierarchyColumn: function() {
            if (this.grid.resolveProperty('columnAutosizing') === false) {
                return;
            }
            var self = this;
            setTimeout(function() {
                self.grid.autosizeColumn(-1);
            }, 40);
        },

        /**
        * @function
        * @instance
        * @description
        connect to q at newUrl
        */
        connect: function() {
            var d = {};
            var self = this;
            if ('WebSocket' in window) {
                try {
                    this.ws = new WebSocket(this.url);
                } catch (e) {
                    console.log('could not connect to ' + this.url + ', trying to reconnect in a moment...');
                    return;
                }
                console.log('connecting...');
                this.ws.onopen = function() {
                    self.setFixedColumnWidth(0, 160);
                    var startY = this.scrollPositionY || 0;
                    var stopY = startY + 60;

                    self.sendMessage({
                        id: self.getNextMessageId(),
                        fn: 'get',
                        start: startY,
                        end: stopY
                    });
                };
                this.ws.onclose = function() {

                    console.log('disconnected from ' + this.url + ', trying to reconnect in a moment...');

                };
                this.ws.onmessage = function(e) {
                    d = JSON.parse(e.data);
                    if (logMessages) {
                        console.log('in-' + Date.now(), d);
                    }
                    var msgId = d.id;
                    var action = self.msgResponsesActions[msgId];
                    if (action) {
                        action(d);
                        self.msgResponsesActions[msgId] = undefined;
                    } else {
                        self.handleMessage(d);
                    }

                };
                this.ws.onerror = function(e) {
                    self.clearData();
                    console.error('problem with connection to q at ' + this.url + ', trying again in a moment...', e.data);
                    setTimeout(function() {
                        //     self.connect();
                    }, 2000);
                };
            } else {
                console.error('WebSockets not supported on your browser.');
            }
        },

        /**
         * @function
         * @instance
         * @description
         bind column editor appropriate css values to arg style
         * @param {HTMLStyleElement} style - the style object to enhance
         */
        beColumnStyle: function(style) {
            style.top = '5%';
            style.position = 'absolute';
            style.width = '33.3333%';
            style.height = '99%';
            style.whiteSpace = 'nowrap';
        },

        /**
         * @function
         * @instance
         * @description
         returns true if we should highlight on hover
         * #### returns: boolean
         * @param {boolean} isColumnHovered - the column is hovered or not
         * @param {boolean} isRowHovered - the row is hovered or not
         */
        highlightCellOnHover: function(isColumnHovered, isRowHovered) {
            return isRowHovered;
        },

        /**
         * @function
         * @instance
         * @description
         return the cell editor for coordinate x,y
         * #### returns: [fin-hypergrid-cell-editor-base](module-cell-editors_base.html)
         * @param {integer} x - x coordinate
         * @param {integer} y - y coordinate
         */
        getCellEditorAt: function(x, y) {
            noop(x, y);
            return null;
        },

        /**
         * @function
         * @instance
         * @description
         return the number of fixed columns
         * #### returns: integer
         */
        getFixedColumnCount: function() {
            return 1;
        },
        getTreeStateDescription: function() {
            var object = this.block.M;
            var result = '<table class="qtreedescription">\n';
            var data = '<tr>';
            for (var property in object) {
                if (object.hasOwnProperty(property)) {
                    result = result + '<col><col>';
                    data = data + '<td>' + property + ':</td><td>' + object[property] + '</td>\n';
                }
            }
            result = result + '\n' + data + '</tr></table>';
            return result;
        }

    });

})(); /* jslint ignore:line */
