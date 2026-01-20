new Vue({
    el: '#app',
    vuetify: new Vuetify({
        theme: { dark: true },
    }),
    data() {
        return {
            selectedGuestId: null,
            guestList: [],
            awards: [],
            predictions: {},
            rooms: [],
            predictionsLocked: false,
            submitted: false,
            submitting: false,
            websocket: null
        }
    },
    computed: {
        selectedGuest() {
            if (!this.selectedGuestId) return null
            return this.guestList.find(g => g.id === this.selectedGuestId)
        },
        completedCount() {
            return Object.keys(this.predictions).filter(k => this.predictions[k]).length
        },
        progressPercent() {
            if (this.awards.length === 0) return 0
            return (this.completedCount / this.awards.length) * 100
        },
        canSubmit() {
            const hasGuest = this.selectedGuestId !== null
            const hasAnyPredictions = this.completedCount > 0
            return hasGuest && hasAnyPredictions
        }
    },
    methods: {
        loadAwards() {
            axios.get('/data/awards')
                .then(response => {
                    this.awards = response.data
                    // Initialize predictions object
                    this.awards.forEach(award => {
                        if (!this.predictions[award.id]) {
                            this.$set(this.predictions, award.id, null)
                        }
                    })
                })
                .catch(e => {
                    console.error('Error loading awards:', e)
                })
        },
        loadGuests() {
            axios.get('/data/guests')
                .then(response => {
                    this.guestList = response.data.map(guest => ({
                        ...guest,
                        hasPredictions: guest.predictions && Object.keys(guest.predictions).length > 0
                    }))
                })
                .catch(e => {
                    console.error('Error loading guests:', e)
                })
        },
        loadRooms() {
            axios.get('/data/rooms')
                .then(response => {
                    this.rooms = response.data
                })
                .catch(e => {
                    console.error('Error loading rooms:', e)
                })
        },
        loadAppState() {
            axios.get('/data/app_state')
                .then(response => {
                    this.predictionsLocked = response.data.predictions_locked
                })
                .catch(e => {
                    console.error('Error loading app state:', e)
                })
        },
        getRoomName(roomCode) {
            const room = this.rooms.find(r => r.code === roomCode)
            return room ? room.name : roomCode
        },
        loadGuestPredictions() {
            this.submitted = false

            if (!this.selectedGuestId) {
                // Clear predictions
                this.awards.forEach(award => {
                    this.$set(this.predictions, award.id, null)
                })
                return
            }

            const guest = this.guestList.find(g => g.id === this.selectedGuestId)
            if (guest && guest.predictions) {
                // Load existing predictions
                this.awards.forEach(award => {
                    const prediction = guest.predictions[award.id] || guest.predictions[String(award.id)]
                    this.$set(this.predictions, award.id, prediction || null)
                })
            } else {
                // Clear predictions
                this.awards.forEach(award => {
                    this.$set(this.predictions, award.id, null)
                })
            }
        },
        async submitPredictions() {
            if (!this.canSubmit || this.predictionsLocked) return

            this.submitting = true

            try {
                // Convert predictions to string keys for JSON
                const predictionsData = {}
                for (const [awardId, nomineeId] of Object.entries(this.predictions)) {
                    if (nomineeId) {
                        predictionsData[String(awardId)] = nomineeId
                    }
                }

                // Update guest predictions
                await axios.put('/data/guests/' + this.selectedGuestId, {
                    predictions: predictionsData
                })

                this.submitted = true

                // Update local guest list
                const guest = this.guestList.find(g => g.id === this.selectedGuestId)
                if (guest) {
                    guest.predictions = predictionsData
                    guest.hasPredictions = true
                }

                // Notify via WebSocket
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send('guestSubmitted+++' + this.selectedGuestId + '+++' + this.selectedGuest.name)
                }
            } catch (e) {
                console.error('Error saving predictions:', e)
                alert('Error saving predictions. Please try again.')
            } finally {
                this.submitting = false
            }
        },
        connectToWebsocket() {
            this.websocket = new ReconnectingWebSocket("ws://" + location.hostname + ":8001/ws")

            this.websocket.onopen = () => {
                console.log('WebSocket connected')
            }

            this.websocket.onmessage = (event) => {
                const content = event.data.split("+++")
                const action = content[0]

                if (action === 'lockPredictions') {
                    this.predictionsLocked = true
                } else if (action === 'unlockPredictions') {
                    this.predictionsLocked = false
                } else if (action === 'guestsUpdated') {
                    // Reload guest list when admin updates it
                    this.loadGuests()
                }
            }

            this.websocket.onclose = () => {
                console.log('WebSocket disconnected')
            }
        },
        ping() {
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                this.websocket.send('__ping__')
            }
        }
    },
    beforeMount() {
        this.loadAwards()
        this.loadGuests()
        this.loadRooms()
        this.loadAppState()
        this.connectToWebsocket()

        // Poll for app state changes
        setInterval(() => {
            this.loadAppState()
        }, 5000)
    }
})
