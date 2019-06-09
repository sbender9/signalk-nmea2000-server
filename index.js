/*
 * Copyright 2019 Scott Bender <scott@scottbender.net>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const net = require('net')
const canboatjs = require('@canboat/canboatjs')
const _ = require('lodash')

const pgnFuncs = {
  actisense: canboatjs.pgnToActisenseSerialFormat,
  digitalYacht: canboatjs.pgnToiKonvertSerialFormat,
  ydgw: canboatjs.pgnToYdgwRawFormat
}

const DELIMITERS = {
  None: '',
  CRLF: '\r\n',
  LF: '\n'
}

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = []
  const openSockets = {}
  let servers = []
  
  plugin.start = function(props) {
    if ( props.servers && props.servers.length > 0 ) {
      props.servers.forEach(server => {
        startServer(server.format, server.port, server.lineDelimiter)
      })
    }
  }

  function startServer(format, port, lineDelimiter) {
    const delimiter = DELIMITERS[lineDelimiter]
    const converter = pgnFuncs[format]

    if ( !converter ) {
      console.error(`Unknown format: ${format}`)
      app.setProviderError(`Unknown format: ${format}`)
      return
    }

    let serverInfo = {
      idSequence: 0,
      openSockets: {}
    }

    let server = net.createServer(function (socket) {
      socket.id = serverInfo.idSequence++
      socket.name = socket.remoteAddress + ':' + socket.remotePort
      app.debug('Connected:' + socket.id + ' ' + socket.name)
      serverInfo.openSockets[socket.id] = socket
      socket.on('data', data => {
      })
      socket.on('end', function () {
        // client disconnects
        app.debug('Ended:' + socket.id + ' ' + socket.name)
        delete serverInfo.openSockets[socket.id]
      })
      socket.on('error', function (err) {
        app.debug('Error:' + err + ' ' + socket.id + ' ' + socket.name)
        delete serverInfo.openSockets[socket.id]
      })
    })

    const send = data => {
      _.values(serverInfo.openSockets).forEach(function (socket) {
        try {
          socket.write(data + delimiter)
        } catch (e) {
          console.error(e + ' ' + socket)
        }
      })
    }
    app.on('N2KAnalyzerOut', (pgn) => {
      send(converter(pgn))
    })
    app.on('nmea2000JsonOut', (pgn) => {
      send(converter(pgn))
    })
    server.on('listening', () =>
              app.debug('NMEA2000 %s tcp server listening on %d ', format, port)
             )
    server.on('error', e => {
      console.error(`NMEA 2000 tcp server error: ${e.message}`)
    })
    server.listen(port)
    servers.push(server)
  }
    
  plugin.stop = function() {
    unsubscribes.forEach(f => f())
    unsubscribes = []

    servers.forEach(s => s.close())
    servers = []
  }
  
  plugin.id = "signalk-nmea2000-server"
  plugin.name = "NMEA2000 Server"
  plugin.description = "Signal K Node Server Plugin that server nmea2000 data on the network"

  plugin.schema = {
    type: "object",
    properties: {
      servers: {
        type: "array",
        title: "Servers",
        items: {
          type: "object",
          required: [ 'port' ],
          properties: {
            format: {
              type: 'string',
              title: 'Format',
              enum: ['actisense', 'ydgw', 'digitalYacht'],
              enumNames: ['Actisense', 'YDGW', 'iKonvert' ],
              default: 'actisense'
            },
            port: {
              type: 'number',
              title: 'TCP Port',
              default: 1500
            },
            lineDelimiter: {
              type: 'string',
              title: 'Line Delimiter',
              enum: ['None', 'LF', 'CRLF'],
              default: 'LF'
            }
          }
        }
      }
    }
  }

  return plugin;
}
