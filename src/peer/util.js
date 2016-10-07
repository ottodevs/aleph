// @flow

const pull = require('pull-stream')
const Multiaddr = require('multiaddr')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const lp = require('pull-length-prefixed')

import type { PeerInfoMsg, LookupPeerResponseMsg, ProtoCodec } from '../protobuf/types'

/**
 * A through stream that accepts POJOs and encodes them with the given `protocol-buffers` schema
 * @param codec a `protocol-buffers` schema, containing an `encode` function
 * @returns a pull-stream through function that will output encoded protos, prefixed with thier varint-encoded size
 */
function protoStreamEncode<T> (codec: ProtoCodec<T>): Function {
  return pull(
    pull.map(codec.encode),
    lp.encode()
  )
}

/**
 * A through-stream that accepts size-prefixed encoded protbufs, decodes with the given decoder function,
 * and emits the decoded POJOs.
 * @param codec a `protocol-buffers` schema, containing a `decode` function
 * @returns a through-stream function that can be wired into a pull-stream pipeline
 */
function protoStreamDecode<T> (codec: ProtoCodec<T>): Function {
  return pull(
    lp.decode(),
    pull.map(codec.decode)
  )
}

/**
 * Convert a decoded LookupPeerResponse object into a libp2p PeerInfo object
 * @param resp a LookupPeerResponse protobuf, decoded into a POJO
 * @returns a libp2p PeerInfo object, or null if lookup failed
 */
function lookupResponseToPeerInfo (resp: LookupPeerResponseMsg): ?PeerInfo {
  const peer = resp.peer
  if (peer == null) return null

  return peerInfoProtoUnmarshal(peer)
}

/**
 * Convert a decoded PeerInfo protobuf message into a libp2p PeerInfo object
 * @param pbPeer a PeerInfo protobuf message, decoded into a POJO
 * @returns {PeerInfo} a libp2p PeerInfo object
 */
function peerInfoProtoUnmarshal (pbPeer: PeerInfoMsg): PeerInfo {
  const peerId = PeerId.createFromB58String(pbPeer.id)
  const peerInfo = new PeerInfo(peerId)
  if (pbPeer.addr == null) {
    return peerInfo
  }
  pbPeer.addr.forEach((addrBytes: Buffer) => {
    const addr = new Multiaddr(addrBytes)
    peerInfo.multiaddr.add(addr)
  })
  return peerInfo
}

/**
 * Convert a libp2p PeerInfo object into a PeerInfo protobuf message POJO
 * @param peerInfo a libp2p PeerInfo
 * @returns a POJO that's encodable to a PeerInfo protobuf message
 */
function peerInfoProtoMarshal (peerInfo: PeerInfo): PeerInfoMsg {
  return {
    id: peerInfo.id.toB58String(),
    addr: peerInfo.multiaddrs.map(a => a.buffer)
  }
}

/**
 * Like a standard pull-stream `pull`, but returns a Promise that will contain the final value.
 * Use when you want a single value out of a stream, not for long-lived connections, etc.
 * @param streams a pull-stream pipeline of source + through streams.  Do not include a sink,
 *        since we're draining to Promise.resolve
 * @returns {Promise} a promise that will resolve to the first value that reaches the end of the pipeline.
 */
function pullToPromise<T> (...streams: Array<Function>): Promise<T> {
  return new Promise(resolve => {
    pull(
      ...streams,
      pull.take(1),
      pull.drain(resolve)
    )
  })
}

/**
 * A pull-stream source that supplies `value` repeatedly, waiting at least `interval` milliseconds
 * between pulls.
 * @param value whatever you want to send
 * @param interval milliseconds to wait between providing value to consumers
 * @returns a pull-stream source
 */
function pullRepeatedly (value: any, interval: number = 1000): Function {
  let intervalStart: ?Date = null
  let timeoutId: ?number = null
  function intervalElapsed () {
    return intervalStart == null || (new Date().getTime() - intervalStart >= interval)
  }

  return function send (end, cb) {
    if (end) {
      if (timeoutId != null) {
        clearTimeout(timeoutId)
      }
      return cb(end)
    }

    if (intervalElapsed()) {
      intervalStart = new Date()
      cb(null, value)
      return
    }
    if (intervalStart == null) intervalStart = new Date()
    const elapsedTime = new Date().getTime() - intervalStart
    timeoutId = setTimeout(send, interval - elapsedTime, end, cb)
  }
}

module.exports = {
  protoStreamEncode,
  protoStreamDecode,
  lookupResponseToPeerInfo,
  peerInfoProtoUnmarshal,
  peerInfoProtoMarshal,
  pullToPromise,
  pullRepeatedly
}