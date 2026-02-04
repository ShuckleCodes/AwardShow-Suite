new Vue({
    el: '#app',
    vuetify: new Vuetify({
        theme: { dark: true },
    }),
    data() {
        return {
            darkMode: true,
            websocket: null,
            websocketConnected: false,
            scrollOptions: {
                duration: 200,
                offset: 0,
                easing: 'easeInOutCubic'
            },
            // Award Show Predictions data
            awards: [],
            guests: [],
            rooms: [],
            winners: {},
            predictionsLocked: false,
            selectedAwardId: null,
            deleteDialog: false,
            // Room management
            newRoomName: '',
            newRoomCode: '',
            // Edit guest rooms
            editRoomsDialog: false,
            editingGuest: null,
            editingGuestRooms: [],
            // New guest creation
            newGuestName: '',
            newGuestRooms: []
        }
    },
    computed: {
        awardOptions() {
            return this.awards.map(a => ({
                id: a.id,
                name: a.name
            }))
        },
        selectedAward() {
            if (!this.selectedAwardId) return null
            return this.awards.find(a => a.id === this.selectedAwardId)
        },
        sortedGuests() {
            return [...this.guests].sort((a, b) => (b.score || 0) - (a.score || 0))
        }
    },
    methods: {
        sendMessage(message) {
            if (this.websocketConnected) {
                console.log("sending msg: " + message)
                this.websocket.send(message)
            }
        },

        // Load data methods
        loadAwards() {
            axios.get('/data/awards')
                .then(response => {
                    this.awards = response.data
                })
                .catch(e => console.error('Error loading awards:', e))
        },

        loadGuests() {
            axios.get('/data/guests_with_scores')
                .then(response => {
                    this.guests = response.data
                })
                .catch(e => console.error('Error loading guests:', e))
        },

        loadRooms() {
            axios.get('/data/rooms')
                .then(response => {
                    this.rooms = response.data
                })
                .catch(e => console.error('Error loading rooms:', e))
        },

        loadAppState() {
            axios.get('/data/app_state')
                .then(response => {
                    this.predictionsLocked = response.data.predictions_locked
                    this.winners = response.data.winners || {}
                })
                .catch(e => console.error('Error loading app state:', e))
        },

        // Room management
        createRoom() {
            if (!this.newRoomName || !this.newRoomCode) return

            axios.post('/data/rooms', {
                name: this.newRoomName,
                code: this.newRoomCode.toLowerCase().replace(/\s+/g, '')
            })
                .then(() => {
                    this.newRoomName = ''
                    this.newRoomCode = ''
                    this.loadRooms()
                    this.sendMessage('roomsUpdated')
                })
                .catch(e => console.error('Error creating room:', e))
        },

        deleteRoom(roomId) {
            axios.delete('/data/rooms/' + roomId)
                .then(() => {
                    this.loadRooms()
                    this.sendMessage('roomsUpdated')
                })
                .catch(e => console.error('Error deleting room:', e))
        },

        getRoomName(roomCode) {
            const room = this.rooms.find(r => r.code === roomCode)
            return room ? room.name : roomCode
        },

        // Prediction lock toggle
        togglePredictionsLock() {
            const action = this.predictionsLocked ? 'lockPredictions' : 'unlockPredictions'
            this.sendMessage(action)

            axios.post('/data/app_state/lock', {
                locked: this.predictionsLocked
            }).catch(e => console.error('Error toggling lock:', e))
        },

        // Award presentation
        showAwardOnScreen() {
            if (this.selectedAwardId) {
                this.sendMessage('showAward+++' + this.selectedAwardId)
            }
        },

        // Winner selection
        selectWinner(awardId, nomineeId) {
            this.$set(this.winners, awardId, nomineeId)

            // Send WebSocket message to update screen
            this.sendMessage('selectWinner+++' + awardId + '+++' + nomineeId)

            // Save to backend
            axios.post('/data/app_state/winner', {
                award_id: awardId,
                nominee_id: nomineeId
            })
                .then(() => {
                    // Reload guests to update scores
                    this.loadGuests()
                })
                .catch(e => console.error('Error setting winner:', e))
        },

        clearWinner(awardId) {
            this.$delete(this.winners, awardId)

            // Send WebSocket message
            this.sendMessage('clearWinner+++' + awardId)

            // Save to backend
            axios.delete('/data/app_state/winner/' + awardId)
                .then(() => {
                    this.loadGuests()
                })
                .catch(e => console.error('Error clearing winner:', e))
        },

        // Helper methods
        getNomineeName(awardId, nomineeId) {
            if (!nomineeId) return '-'
            const award = this.awards.find(a => a.id === awardId)
            if (!award) return '-'
            const nominee = award.nominees.find(n => n.id === nomineeId)
            return nominee ? nominee.name.split(' (')[0].substring(0, 15) : '-'
        },

        getPredictionColor(guest, awardId) {
            const prediction = guest.predictions[awardId]
            if (!prediction) return 'grey'

            const winner = this.winners[awardId]
            if (!winner) return 'primary'

            return prediction === winner ? 'success' : 'error'
        },

        clearAllGuests() {
            axios.delete('/data/guests')
                .then(() => {
                    this.guests = []
                    this.deleteDialog = false
                })
                .catch(e => console.error('Error clearing guests:', e))
        },

        // WebSocket connection
        connectToWebsocket() {
            this.websocket = new ReconnectingWebSocket("ws://" + location.hostname + ":8001/ws")

            this.websocket.onopen = () => {
                console.log('WebSocket connected')
                this.websocketConnected = true
            }

            this.websocket.onclose = () => {
                console.log('WebSocket disconnected')
                this.websocketConnected = false
            }

            this.websocket.onmessage = (event) => {
                const content = event.data.split("+++")
                const action = content[0]

                if (action === 'guestSubmitted') {
                    // New guest submitted predictions
                    this.loadGuests()
                }
            }
        },

        ping() {
            this.sendMessage('__ping__')
        },

        // Edit guest rooms
        openEditRoomsDialog(guest) {
            this.editingGuest = guest
            this.editingGuestRooms = guest.rooms ? [...guest.rooms] : []
            this.editRoomsDialog = true
        },

        saveGuestRooms() {
            if (!this.editingGuest) return

            axios.put('/data/guests/' + this.editingGuest.id, {
                rooms: this.editingGuestRooms
            })
                .then(() => {
                    this.editRoomsDialog = false
                    this.loadGuests()
                    this.sendMessage('guestsUpdated')
                })
                .catch(e => console.error('Error updating guest rooms:', e))
        },

        // Create new guest
        createGuest() {
            if (!this.newGuestName) return

            axios.post('/data/guests', {
                name: this.newGuestName,
                rooms: this.newGuestRooms,
                predictions: {}
            })
                .then(() => {
                    this.newGuestName = ''
                    this.newGuestRooms = []
                    this.loadGuests()
                    this.sendMessage('guestsUpdated')
                })
                .catch(e => console.error('Error creating guest:', e))
        },

        // Delete a guest
        deleteGuest(guestId) {
            if (!confirm('Are you sure you want to delete this guest?')) return

            axios.delete('/data/guests/' + guestId)
                .then(() => {
                    this.loadGuests()
                    this.sendMessage('guestsUpdated')
                })
                .catch(e => console.error('Error deleting guest:', e))
        }
    },
    beforeMount() {
        this.loadAwards()
        this.loadGuests()
        this.loadRooms()
        this.loadAppState()
        this.connectToWebsocket()

        // Periodic refresh
        setInterval(() => {
            this.loadGuests()
            this.loadAppState()
        }, 10000)
    },
    watch: {
        darkMode(val) {
            this.$vuetify.theme.dark = val
        }
    }
})
