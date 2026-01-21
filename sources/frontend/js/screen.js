/*
 * Oscar Predictions - Display Screen
 */

(function() {
    var guests = []
    var guestElements = {}  // Track DOM elements by guest ID
    var awards = []
    var rooms = []
    var currentRoom = ''  // Current room filter (empty = all)
    var currentAwardId = null
    var currentWinnerId = null
    var scoresInitialized = false
    var winners = {}  // Track winners for score table

    // Load awards data
    function loadAwards() {
        var xhttp = new XMLHttpRequest()
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                awards = JSON.parse(this.responseText)
            }
        }
        xhttp.open("GET", "/data/awards", false)
        xhttp.send()
    }

    // Load app state (winners)
    function loadAppState() {
        var xhttp = new XMLHttpRequest()
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                var state = JSON.parse(this.responseText)
                winners = state.winners || {}
            }
        }
        xhttp.open("GET", "/data/app_state", false)
        xhttp.send()
    }

    // Load rooms
    function loadRooms() {
        var xhttp = new XMLHttpRequest()
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                rooms = JSON.parse(this.responseText)
                updateRoomSelector()
            }
        }
        xhttp.open("GET", "/data/rooms", false)
        xhttp.send()
    }

    // Update room selector dropdown
    function updateRoomSelector() {
        var select = document.querySelector("#room-select")
        select.innerHTML = '<option value="">All Guests</option>'

        rooms.forEach(function(room) {
            var option = document.createElement("option")
            option.value = room.code
            option.textContent = room.name
            select.appendChild(option)
        })

        // Show selector if there are rooms
        if (rooms.length > 0) {
            document.querySelector("#room-selector").style.display = "block"
        }
    }

    // Switch room
    window.switchRoom = function(roomCode) {
        currentRoom = roomCode
        scoresInitialized = false  // Force reinitialize
        loadGuests()

        // Update room name display
        var roomNameEl = document.querySelector("#scoreboard-room-name")
        if (roomCode && rooms.length > 0) {
            var room = rooms.find(function(r) { return r.code === roomCode })
            roomNameEl.textContent = room ? room.name : ''
        } else {
            roomNameEl.textContent = ''
        }

        // Refresh scoreboard if visible
        if (document.querySelector("#div-scoreboard").style.display === "block") {
            loadAppState()
            initializeScoreboard()
            buildScoresTable(winners)
            animateScores()
        }
    }

    // Load guests with scores (doesn't update display)
    function loadGuests() {
        var url = "/data/guests_with_scores"
        if (currentRoom) {
            url += "?room=" + encodeURIComponent(currentRoom)
        }

        var xhttp = new XMLHttpRequest()
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                var newGuests = JSON.parse(this.responseText)

                // Preserve old scores for animation
                newGuests.forEach(function(newGuest) {
                    var existingGuest = guests.find(function(g) { return g.id === newGuest.id })
                    if (existingGuest) {
                        newGuest.oldScore = existingGuest.displayScore !== undefined ? existingGuest.displayScore : (existingGuest.score || 0)
                    } else {
                        newGuest.oldScore = 0
                    }
                    newGuest.displayScore = newGuest.oldScore  // Current displayed score
                })

                guests = newGuests
            }
        }
        xhttp.open("GET", url, false)
        xhttp.send()
    }

    // Easing function for smooth animation
    function ease(t, a, b) {
        var eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        return (b - a) * eased + a
    }

    // Create guest card element
    function createGuestCard(guest, index, leftPos) {
        var card = document.createElement("div")
        card.classList.add("guest-card")
        card.setAttribute("data-guest-id", guest.id)
        card.style.position = "absolute"
        card.style.transition = "none"  // Override CSS - added later after positioning
        card.style.left = leftPos + "px"  // Set position before adding to DOM

        var photoSrc = guest.photo ? "/home/data/" + guest.photo : "/home/data/Backgrounds/oscar.png"

        card.innerHTML =
            '<img class="guest-photo" src="' + photoSrc + '" onerror="this.src=\'/home/data/Backgrounds/oscar.png\'">' +
            '<div class="guest-name">' + guest.name + '</div>' +
            '<div class="guest-score">' + (guest.displayScore || 0) + '</div>'

        return card
    }

    // Initialize scoreboard (first time setup)
    function initializeScoreboard() {
        var innerScoreboard = document.querySelector("#inner-scoreboard")
        innerScoreboard.innerHTML = ""
        guestElements = {}

        // Sort by score descending, then alphabetically
        var sortedGuests = [...guests].sort(function(a, b) {
            var scoreDiff = (b.displayScore || 0) - (a.displayScore || 0)
            if (scoreDiff !== 0) return scoreDiff
            return (a.name || '').localeCompare(b.name || '')
        })

        // Calculate positions first
        var cardWidth = 260
        var containerWidth = innerScoreboard.offsetWidth || window.innerWidth
        var totalWidth = sortedGuests.length * cardWidth
        var startLeft = (containerWidth - totalWidth) / 2

        sortedGuests.forEach(function(guest, index) {
            var leftPos = startLeft + (index * cardWidth)
            var card = createGuestCard(guest, index, leftPos)
            guestElements[guest.id] = card
            innerScoreboard.appendChild(card)
        })

        scoresInitialized = true
    }

    // Get nominee name by award ID and nominee ID
    function getNomineeName(awardId, nomineeId) {
        if (!nomineeId) return '-'
        var award = awards.find(function(a) { return a.id == awardId })
        if (!award) return '-'
        var nominee = award.nominees.find(function(n) { return n.id == nomineeId })
        return nominee ? nominee.name.split(' (')[0].substring(0, 10) : '-'
    }

    // Shorten award names for table headers
    function shortenAwardName(name) {
        var shortNames = {
            'Best Picture': 'Picture',
            'Best Director': 'Director',
            'Best Actor': 'Actor',
            'Best Actress': 'Actress',
            'Best Supporting Actor': 'Supp. Actor',
            'Best Supporting Actress': 'Supp. Actress',
            'Best Original Screenplay': 'Orig. SP',
            'Best Adapted Screenplay': 'Adap. SP',
            'Best Animated Feature': 'Animated',
            'Best International Feature': 'Int. Feat.',
            'Best Documentary Feature': 'Doc. Feat.',
            'Best Documentary Short': 'Doc. Short',
            'Best Live Action Short': 'Live Short',
            'Best Animated Short': 'Anim. Short',
            'Best Original Score': 'Score',
            'Best Original Song': 'Song',
            'Best Sound': 'Sound',
            'Best Production Design': 'Prod. Design',
            'Best Cinematography': 'Cinematog.',
            'Best Makeup and Hairstyling': 'Makeup',
            'Best Costume Design': 'Costume',
            'Best Film Editing': 'Editing',
            'Best Visual Effects': 'VFX'
        }
        return shortNames[name] || name.replace('Best ', '')
    }

    // Build the scores table
    function buildScoresTable(winners) {
        var headerRow = document.querySelector("#scores-table-header")
        var tbody = document.querySelector("#scores-table-body")

        // Build header with award columns (no score column)
        headerRow.innerHTML = '<th class="guest-col">Guest</th>'
        awards.forEach(function(award) {
            var th = document.createElement("th")
            th.textContent = shortenAwardName(award.name)
            headerRow.appendChild(th)
        })

        // Build body rows - sort alphabetically
        tbody.innerHTML = ""
        var sortedGuests = [...guests].sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '')
        })

        sortedGuests.forEach(function(guest) {
            var tr = document.createElement("tr")

            // Guest name cell
            var tdGuest = document.createElement("td")
            tdGuest.className = "guest-col"
            tdGuest.textContent = guest.name
            tr.appendChild(tdGuest)

            // Prediction cells for each award
            awards.forEach(function(award) {
                var td = document.createElement("td")
                var prediction = guest.predictions ? guest.predictions[award.id] : null
                var nomineeName = getNomineeName(award.id, prediction)

                var chipClass = "none"
                if (prediction) {
                    var winner = winners ? winners[award.id] : null
                    if (!winner) {
                        chipClass = "pending"
                    } else if (prediction == winner) {
                        chipClass = "correct"
                    } else {
                        chipClass = "incorrect"
                    }
                }

                td.innerHTML = '<span class="prediction-chip ' + chipClass + '">' + nomineeName + '</span>'
                tr.appendChild(td)
            })

            tbody.appendChild(tr)
        })
    }

    // Position cards based on current scores, then alphabetically
    function positionCards(animate) {
        var sortedGuests = [...guests].sort(function(a, b) {
            var scoreA = animate ? (a.score || 0) : (a.displayScore || 0)
            var scoreB = animate ? (b.score || 0) : (b.displayScore || 0)
            var scoreDiff = scoreB - scoreA
            if (scoreDiff !== 0) return scoreDiff
            return (a.name || '').localeCompare(b.name || '')
        })

        var maxScore = sortedGuests.length > 0 ? (sortedGuests[0].score || 0) : 0
        var cardWidth = 260  // card width + margin + padding
        var innerScoreboard = document.querySelector("#inner-scoreboard")
        var containerWidth = innerScoreboard.offsetWidth
        var totalWidth = sortedGuests.length * cardWidth
        var startLeft = (containerWidth - totalWidth) / 2  // Center the group

        sortedGuests.forEach(function(guest, index) {
            var card = guestElements[guest.id]
            if (!card) return

            var leftPos = startLeft + (index * cardWidth)
            card.style.left = leftPos + "px"

            // Highlight leader(s)
            var isLeader = (guest.score || 0) === maxScore && maxScore > 0
            if (isLeader) {
                card.classList.add("leader")
            } else {
                card.classList.remove("leader")
            }
        })
    }

    // Animate scores from old to new values
    function animateScores() {
        var duration = 2000  // 2 seconds
        var start = null
        var transitionsEnabled = false

        function animationFrame(timestamp) {
            if (!start) start = timestamp
            var elapsed = timestamp - start
            var progress = Math.min(elapsed / duration, 1)

            guests.forEach(function(guest) {
                var oldScore = guest.oldScore || 0
                var newScore = guest.score || 0
                var currentScore = Math.round(ease(progress, oldScore, newScore))

                guest.displayScore = currentScore

                var card = guestElements[guest.id]
                if (card) {
                    var scoreEl = card.querySelector(".guest-score")
                    if (scoreEl) {
                        scoreEl.textContent = currentScore
                    }
                }
            })

            // Reposition cards during animation for dramatic effect
            if (progress > 0.3) {
                // Enable transitions just before first reposition
                if (!transitionsEnabled) {
                    Object.values(guestElements).forEach(function(card) {
                        card.style.transition = "left 2s ease-in-out, box-shadow 0.5s ease"
                    })
                    transitionsEnabled = true
                }
                positionCards(true)
            }

            if (progress < 1) {
                requestAnimationFrame(animationFrame)
            } else {
                // Animation complete - ensure final values
                guests.forEach(function(guest) {
                    guest.displayScore = guest.score || 0
                    guest.oldScore = guest.score || 0
                })
                positionCards(true)
            }
        }

        requestAnimationFrame(animationFrame)
    }

    // Show scoreboard with animation
    function showScoreboard() {
        loadGuests()  // Get latest scores for current room
        loadAppState()  // Get latest winners

        // Reset all scores to 0 for animation from zero
        guests.forEach(function(guest) {
            guest.oldScore = 0
            guest.displayScore = 0
        })

        // Reinitialize scoreboard with cards visible
        initializeScoreboard()

        // Update room name display
        var roomNameEl = document.querySelector("#scoreboard-room-name")
        if (currentRoom && rooms.length > 0) {
            var room = rooms.find(function(r) { return r.code === currentRoom })
            roomNameEl.textContent = room ? room.name : ''
        } else {
            roomNameEl.textContent = ''
        }

        // Build the scores table but hide it initially (off-screen)
        buildScoresTable(winners)
        var scoresTable = document.querySelector("#scores-table-container")
        scoresTable.style.transition = "none"
        scoresTable.style.transform = "translateY(100%)"

        showDiv("scoreboard")

        // Start score animation after a brief delay
        setTimeout(function() {
            animateScores()
        }, 500)

        // Slide table up after card animation completes (500ms delay + 2000ms animation + 2500ms buffer)
        setTimeout(function() {
            scoresTable.style.transition = "transform 0.8s ease-out"
            scoresTable.style.transform = "translateY(0)"
        }, 5000)
    }

    // Show award with nominees
    function showAward(awardId) {
        currentAwardId = awardId
        currentWinnerId = null

        var award = awards.find(function(a) { return a.id == awardId })
        if (!award) return

        document.querySelector("#award-title").textContent = award.name

        var grid = document.querySelector("#nominees-grid")
        grid.innerHTML = ""

        award.nominees.forEach(function(nominee, index) {
            var card = document.createElement("div")
            card.classList.add("nominee-card")
            card.setAttribute("data-nominee-id", nominee.id)

            var imageSrc = nominee.image ? "/home/data/nominees/" + nominee.image : "/home/data/Backgrounds/oscar.png"

            // Find guests who predicted this nominee
            var predictorsHtml = '<div class="nominee-predictors">'
            guests.forEach(function(guest) {
                if (guest.predictions && guest.predictions[awardId] == nominee.id) {
                    var photoSrc = guest.photo ? "/home/data/" + guest.photo : "/home/data/Backgrounds/oscar.png"
                    predictorsHtml += '<img class="predictor-avatar" src="' + photoSrc + '" title="' + guest.name + '" onerror="this.src=\'/home/data/Backgrounds/oscar.png\'">'
                }
            })
            predictorsHtml += '</div>'

            card.innerHTML =
                '<div class="trophy-icon"><img class="oscar-icon" src="/home/data/Backgrounds/OscarIcon.png" ></div>' +
                '<img class="nominee-image" src="' + imageSrc + '" onerror="this.src=\'/home/data/Backgrounds/oscar.png\'">' +
                '<p class="nominee-name">' + nominee.name + '</p>' +
                predictorsHtml

            grid.appendChild(card)

            // Animate each nominee with 2 second delay between each
            setTimeout(function() {
                card.classList.add("animate-in")
            }, index * 2000)
        })

        // Animate predictor avatars after all nominees have appeared
        var predictorsDelay = (award.nominees.length - 1) * 2000 + 1000
        setTimeout(function() {
            document.querySelectorAll(".predictor-avatar").forEach(function(avatar, index) {
                setTimeout(function() {
                    avatar.classList.add("animate-in")
                }, index * 100)
            })
        }, predictorsDelay)

        showDiv("award")
    }

    // Select winner for current award
    function selectWinner(awardId, nomineeId) {
        currentWinnerId = nomineeId

        // Remove winner class from all cards
        document.querySelectorAll(".nominee-card").forEach(function(card) {
            card.classList.remove("winner")
        })

        // Add winner class to selected nominee
        var winnerCard = document.querySelector('.nominee-card[data-nominee-id="' + nomineeId + '"]')
        if (winnerCard) {
            winnerCard.classList.add("winner")
        }
    }

    // Clear winner highlight
    function clearWinner(awardId) {
        document.querySelectorAll(".nominee-card").forEach(function(card) {
            card.classList.remove("winner")
        })
        currentWinnerId = null
    }

    // Show specific div
    function showDiv(name) {
        document.querySelector("#div-" + name).style.display = "block"
        document.querySelectorAll(".div-containers").forEach(function(cont) {
            if (!cont.id.includes(name)) {
                cont.style.display = "none"
            }
        })
        if (name != "video") {
            document.querySelector("#video").pause()
        }

        // Show/hide scores table based on whether scoreboard is visible
        var scoresTable = document.querySelector("#scores-table-container")
        if (name === "scoreboard") {
            scoresTable.style.display = "block"
        } else {
            scoresTable.style.display = "none"
        }

        // Show/hide room selector only on scoreboard
        var roomSelector = document.querySelector("#room-selector")
        if (name === "scoreboard" && rooms.length > 0) {
            roomSelector.style.display = "block"
        } else {
            roomSelector.style.display = "none"
        }

        // Start/stop random category display on logo screen
        if (name === "taskmaster") {
            setTimeout(startRandomCategoryDisplay, 10000)
        } else {
            stopRandomCategoryDisplay()
        }
    }

    var audio = null

    function playSound(file) {
        if (audio) {
            audio.pause()
        }
        audio = new Audio(file)
        audio.play()
    }

    function loopSound(file) {
        if (audio) {
            audio.pause()
        }
        audio = new Audio(file)
        audio.loop = true
        audio.play()
    }

    // Initialize
    loadAwards()
    loadRooms()
    loadGuests()
    loadAppState()
    showDiv("taskmaster")  // Default to logo screen on load

    // Random category display on logo screen
    var randomCategoryInterval = null
    var lastRandomAwardIndex = -1

    function showRandomCategory() {
        if (awards.length === 0) return

        var container = document.querySelector("#random-category-display")
        var titleEl = document.querySelector("#random-category-title")
        var nomineesEl = document.querySelector("#random-category-nominees")

        // Pick a random award (different from last one if possible)
        var randomIndex
        if (awards.length > 1) {
            do {
                randomIndex = Math.floor(Math.random() * awards.length)
            } while (randomIndex === lastRandomAwardIndex)
        } else {
            randomIndex = 0
        }
        lastRandomAwardIndex = randomIndex

        var award = awards[randomIndex]

        // Fade out
        container.classList.remove("visible")

        setTimeout(function() {
            // Update content
            titleEl.textContent = award.name

            nomineesEl.innerHTML = ""
            award.nominees.forEach(function(nominee) {
                var card = document.createElement("div")
                card.classList.add("random-nominee-card")

                var imageSrc = nominee.image ? "/home/data/nominees/" + nominee.image : "/home/data/Backgrounds/oscar.png"

                card.innerHTML =
                    '<img src="' + imageSrc + '" onerror="this.src=\'/home/data/Backgrounds/oscar.png\'">' +
                    '<div class="name">' + nominee.name + '</div>'

                nomineesEl.appendChild(card)
            })

            // Fade in
            container.classList.add("visible")
        }, 800)
    }

    function startRandomCategoryDisplay() {
        if (randomCategoryInterval) clearInterval(randomCategoryInterval)
        showRandomCategory()
        randomCategoryInterval = setInterval(showRandomCategory, 40000)
    }

    function stopRandomCategoryDisplay() {
        if (randomCategoryInterval) {
            clearInterval(randomCategoryInterval)
            randomCategoryInterval = null
        }
        var container = document.querySelector("#random-category-display")
        container.classList.remove("visible")
    }

    // WebSocket connection
    var ws = new ReconnectingWebSocket("ws://" + window.location.host + "/ws")

    ws.onclose = function() {
        console.log('websocket disconnected')
        document.querySelector("#div-no-connection").style.display = "block"
    }

    ws.onopen = function() {
        console.log('websocket connected')
        document.querySelector("#div-no-connection").style.display = "none"
    }

    ws.onmessage = function(event) {
        console.log("received msg '" + event.data + "'")
        var content = event.data.split("+++")
        var action = content[0]

        if (action == "play") {
            // Manual update trigger - reload and animate if scoreboard is visible
            loadGuests()
            if (document.querySelector("#div-scoreboard").style.display === "block") {
                animateScores()
            }
        } else if (action == "showAward") {
            showAward(parseInt(content[1]))
        } else if (action == "selectWinner") {
            selectWinner(parseInt(content[1]), parseInt(content[2]))
            // Update winners and refresh table if scoreboard visible
            winners[content[1]] = parseInt(content[2])
            if (document.querySelector("#div-scoreboard").style.display === "block") {
                loadGuests()  // Reload to get updated scores
                buildScoresTable(winners)
            }
        } else if (action == "clearWinner") {
            clearWinner(parseInt(content[1]))
            // Update winners and refresh table if scoreboard visible
            delete winners[content[1]]
            if (document.querySelector("#div-scoreboard").style.display === "block") {
                loadGuests()  // Reload to get updated scores
                buildScoresTable(winners)
            }
        } else if (action == "showImage") {
            document.querySelector("#image").src = content[1]
            showDiv("image")
        } else if (action == "showScoreboard") {
            showScoreboard()
        } else if (action == "showVideo") {
            document.querySelector("#video-src").setAttribute('src', content[1])
            document.querySelector("#video").load()
            document.querySelector("#video").currentTime = 0
            document.querySelector("#video").play()

            if (audio) {
                audio.pause()
            }

            document.getElementById('video').addEventListener('ended', function(e) {
                showDiv("taskmaster")
            }, false)

            document.getElementById('video').addEventListener('playing', function(e) {
                showDiv("video")
            }, false)
        } else if (action == "showTaskmaster") {
            showDiv("taskmaster")
        } else if (action == "resetScores") {
            scoresInitialized = false
            window.location.reload(true)
        } else if (action == "playSound") {
            playSound(content[1])
        } else if (action == "loopSound") {
            loopSound(content[1])
        } else if (action == "stopSound") {
            if (audio) {
                audio.pause()
            }
        } else if (action == "guestSubmitted") {
            // Don't update display live - wait for showScoreboard
        } else if (action == "roomsUpdated") {
            // Reload rooms when admin updates them
            loadRooms()
        }
    }

    // Window resize handling
    function resize() {
        var divScoreboard2 = document.querySelector("#div-scoreboard-2")
        var w = window.innerWidth
        var h = window.innerHeight

        // Scale based on content
        var scale = Math.min(w / 1920, h / 1080)
        divScoreboard2.style.transform = "scale(" + Math.max(scale, 0.5) + ")"
        divScoreboard2.style.transformOrigin = "top center"
    }

    window.addEventListener("resize", resize)
    resize()
})()
