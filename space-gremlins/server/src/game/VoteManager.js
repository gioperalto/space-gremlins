'use strict'

class VoteManager {
  constructor(settings) {
    this.discussionTime = (settings.discussionTime || 45) * 1000
    this.votingTime = (settings.votingTime || 30) * 1000
    this.confirmEjects = settings.confirmEjects !== false

    this.phase = 'discussion'  // 'discussion' | 'voting' | 'result'
    this.calledBy = null
    this.reportedBodyOf = null
    this.type = null  // 'report' | 'emergency'

    this.votes = new Map()     // voterSocketId -> targetSocketId | 'skip'
    this.chatMessages = []
    this.ghostChatMessages = []

    this.discussionTimer = null
    this.votingTimer = null
    this.onVotingEnd = null
  }

  start({ calledBy, bodyOf, type, players, onDiscussionEnd, onVotingEnd }) {
    this.calledBy = calledBy
    this.reportedBodyOf = bodyOf
    this.type = type
    this.phase = 'discussion'
    this.votes.clear()
    this.chatMessages = []
    this.ghostChatMessages = []
    this.onVotingEnd = onVotingEnd

    this.discussionTimer = setTimeout(() => {
      this.phase = 'voting'
      onDiscussionEnd()
      this.votingTimer = setTimeout(() => {
        this.phase = 'result'
        onVotingEnd(this.tally(players))
      }, this.votingTime)
    }, this.discussionTime)
  }

  castVote(voterSocketId, targetSocketId) {
    if (this.phase !== 'voting') return { ok: false, reason: 'not_voting_phase' }
    if (this.votes.has(voterSocketId)) return { ok: false, reason: 'already_voted' }
    this.votes.set(voterSocketId, targetSocketId)
    return { ok: true }
  }

  addChat(socketId, name, message, isGhost) {
    const entry = {
      socketId,
      name,
      message: message.slice(0, 200),
      timestamp: Date.now(),
    }
    if (isGhost) {
      this.ghostChatMessages.push(entry)
    } else {
      this.chatMessages.push(entry)
    }
    return entry
  }

  tally(players) {
    const counts = new Map()
    let skipCount = 0
    const alivePlayers = players.filter(p => p.alive)
    const aliveIds = new Set(alivePlayers.map(p => p.socketId))

    for (const [, target] of this.votes) {
      if (target === 'skip') {
        skipCount++
      } else if (aliveIds.has(target)) {
        counts.set(target, (counts.get(target) || 0) + 1)
      }
    }

    // Find max
    let maxVotes = skipCount
    let ejected = null  // null = skip/tie

    for (const [id, count] of counts) {
      if (count > maxVotes) {
        maxVotes = count
        ejected = id
      } else if (count === maxVotes && ejected !== null) {
        ejected = null  // tie
      }
    }

    const ejectedPlayer = ejected ? alivePlayers.find(p => p.socketId === ejected) : null

    return {
      votes: Object.fromEntries(this.votes),
      voteCounts: Object.fromEntries(counts),
      skipCount,
      ejected: ejected,
      ejectedName: ejectedPlayer?.name || null,
      ejectedRole: ejectedPlayer && this.confirmEjects ? ejectedPlayer.role : null,
    }
  }

  stop() {
    if (this.discussionTimer) { clearTimeout(this.discussionTimer); this.discussionTimer = null }
    if (this.votingTimer) { clearTimeout(this.votingTimer); this.votingTimer = null }
  }
}

module.exports = { VoteManager }
