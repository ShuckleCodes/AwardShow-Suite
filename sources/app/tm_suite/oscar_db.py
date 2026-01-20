from tinydb import TinyDB, Query
from tm_suite import helper
import ujson
import os

# Initialize TinyDB databases
guests = TinyDB(helper.find_root() + "/sources/db/guests.json")
app_state = TinyDB(helper.find_root() + "/sources/db/app_state.json")
rooms = TinyDB(helper.find_root() + "/sources/db/rooms.json")

# Initialize app_state with default values if empty
if len(app_state) == 0:
    app_state.insert({
        "predictions_locked": False,
        "current_award_id": None,
        "winners": {}
    })


def load_awards():
    """Load awards from the JSON file in data directory."""
    awards_path = helper.find_root() + "/data/awards.json"
    if os.path.exists(awards_path):
        with open(awards_path, 'r', encoding='utf-8') as f:
            data = ujson.load(f)
            return data.get("awards", [])
    return []


async def get_awards():
    """Get all awards with nominees."""
    return load_awards()


# Room functions
async def get_rooms():
    """Get all rooms."""
    result = [{
        "id": r.doc_id,
        "name": r["name"],
        "code": r["code"]
    } for r in rooms]
    return result


async def get_room_by_code(code):
    """Get a room by its code."""
    result = rooms.search(Query().code == code)
    if result:
        r = result[0]
        return {
            "id": r.doc_id,
            "name": r["name"],
            "code": r["code"]
        }
    return None


async def create_room(name, code):
    """Create a new room."""
    # Check if code already exists
    existing = rooms.search(Query().code == code)
    if existing:
        return None
    return rooms.insert({
        "name": name,
        "code": code.lower()
    })


async def delete_room(room_id):
    """Delete a room."""
    rooms.remove(doc_ids=[int(room_id)])


async def clear_rooms():
    """Clear all rooms."""
    rooms.truncate()


# Guest functions
async def get_guests(room_code=None):
    """Get all guests, optionally filtered by room."""
    result = []
    for g in guests:
        guest_data = {
            "id": g.doc_id,
            "name": g["name"],
            "photo": g.get("photo", ""),
            "predictions": g.get("predictions", {}),
            "rooms": g.get("rooms", [])
        }

        # Filter by room if specified
        if room_code:
            if room_code.lower() in [r.lower() for r in guest_data["rooms"]]:
                result.append(guest_data)
        else:
            result.append(guest_data)

    return result


async def get_guest_by_id(guest_id):
    """Get a single guest by ID."""
    return guests.get(doc_id=int(guest_id))


async def create_guest(name, photo="", predictions=None, guest_rooms=None):
    """Create a new guest."""
    if predictions is None:
        predictions = {}
    if guest_rooms is None:
        guest_rooms = []
    return guests.insert({
        "name": name,
        "photo": photo,
        "predictions": predictions,
        "rooms": guest_rooms
    })


async def update_guest(guest_id, name=None, photo=None, predictions=None, guest_rooms=None):
    """Update an existing guest."""
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if photo is not None:
        update_data["photo"] = photo
    if predictions is not None:
        update_data["predictions"] = predictions
    if guest_rooms is not None:
        update_data["rooms"] = guest_rooms

    if update_data:
        guests.update(update_data, doc_ids=[int(guest_id)])


async def update_guest_predictions(guest_id, predictions):
    """Update only the predictions for a guest."""
    guests.update({"predictions": predictions}, doc_ids=[int(guest_id)])


async def update_guest_rooms(guest_id, guest_rooms):
    """Update only the rooms for a guest."""
    guests.update({"rooms": guest_rooms}, doc_ids=[int(guest_id)])


async def delete_guest(guest_id):
    """Delete a guest."""
    guests.remove(doc_ids=[int(guest_id)])


async def get_app_state():
    """Get the current app state."""
    state = app_state.all()[0]
    return {
        "predictions_locked": state.get("predictions_locked", False),
        "current_award_id": state.get("current_award_id"),
        "winners": state.get("winners", {})
    }


async def set_predictions_locked(locked):
    """Lock or unlock predictions."""
    app_state.update({"predictions_locked": locked})


async def set_current_award(award_id):
    """Set the current award being displayed."""
    app_state.update({"current_award_id": award_id})


async def set_winner(award_id, nominee_id):
    """Set the winner for an award."""
    state = app_state.all()[0]
    winners = state.get("winners", {})
    winners[str(award_id)] = nominee_id
    app_state.update({"winners": winners})


async def clear_winner(award_id):
    """Clear the winner for an award."""
    state = app_state.all()[0]
    winners = state.get("winners", {})
    if str(award_id) in winners:
        del winners[str(award_id)]
    app_state.update({"winners": winners})


async def reset_app_state():
    """Reset app state to defaults."""
    app_state.update({
        "predictions_locked": False,
        "current_award_id": None,
        "winners": {}
    })


async def get_guests_with_scores(room_code=None):
    """Get all guests with calculated scores, optionally filtered by room."""
    state = await get_app_state()
    winners = state.get("winners", {})

    result = []
    for g in guests:
        guest_rooms = g.get("rooms", [])

        # Filter by room if specified
        if room_code:
            if room_code.lower() not in [r.lower() for r in guest_rooms]:
                continue

        predictions = g.get("predictions", {})
        score = 0

        # Calculate score: 1 point for each correct prediction
        for award_id, nominee_id in predictions.items():
            if str(award_id) in winners:
                if winners[str(award_id)] == nominee_id:
                    score += 1

        result.append({
            "id": g.doc_id,
            "name": g["name"],
            "photo": g.get("photo", ""),
            "predictions": predictions,
            "rooms": guest_rooms,
            "score": score
        })

    return result


async def clear_guests():
    """Clear all guests."""
    guests.truncate()


async def clear_all_data():
    """Clear all Oscar data (guests, rooms, and app state)."""
    guests.truncate()
    rooms.truncate()
    app_state.truncate()
    app_state.insert({
        "predictions_locked": False,
        "current_award_id": None,
        "winners": {}
    })
