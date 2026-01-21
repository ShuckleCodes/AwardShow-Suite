import threading
from typing import List, Optional, Dict
from fastapi import FastAPI, WebSocket, Response, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect
import uvicorn
import multiprocessing
from tm_suite.loader import generate_files
from tm_suite import helper
from tm_suite import db
from tm_suite import oscar_db
try:
    import easygui
except ImportError:
    easygui = None  # Not available on server
import ujson
import asyncio
import os
import uuid
from pydantic import BaseModel


app = FastAPI()


class ConnectionManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)

    async def broadcast(self, data: str):
        for connection in self.connections:
            await connection.send_text(data)

    def disconnect(self, websocket: WebSocket):
        self.connections.remove(websocket)


manager = ConnectionManager()

app.mount("/home/", StaticFiles(directory=helper.find_root()), name="static")


@app.get("/data/contestants")
async def get_contestants():
    return await db.get_contestants()


@app.get("/data/contestants_with_total_score")
async def get_contestants():
    return await db.get_contestants_with_total_score()


@app.get("/data/tasks")
async def get_tasks():
    return await db.get_tasks()


@app.get("/data/general_files")
async def get_general_files():
    return await db.get_general_files()


@app.get("/data/note")
async def get_note():
    return await db.get_note()


class Note(BaseModel):
    text: str


class GuestCreate(BaseModel):
    name: str
    photo: Optional[str] = ""
    predictions: Optional[Dict[str, int]] = {}
    rooms: Optional[List[str]] = []


class GuestUpdate(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None
    predictions: Optional[Dict[str, int]] = None
    rooms: Optional[List[str]] = None


class LockPredictions(BaseModel):
    locked: bool


class SetWinner(BaseModel):
    award_id: int
    nominee_id: int


class RoomCreate(BaseModel):
    name: str
    code: str


# Oscar Predictions Endpoints
@app.get("/data/awards")
async def get_awards():
    return await oscar_db.get_awards()


# Room endpoints
@app.get("/data/rooms")
async def get_rooms():
    return await oscar_db.get_rooms()


@app.get("/data/rooms/{code}")
async def get_room_by_code(code: str):
    room = await oscar_db.get_room_by_code(code)
    if room:
        return room
    return Response(status_code=404)


@app.post("/data/rooms")
async def create_room(room: RoomCreate):
    room_id = await oscar_db.create_room(room.name, room.code)
    if room_id:
        return {"id": room_id}
    return Response(status_code=409)  # Conflict - code already exists


@app.delete("/data/rooms/{room_id}")
async def delete_room(room_id: int):
    await oscar_db.delete_room(room_id)
    return Response(status_code=204)


# Guest endpoints
@app.get("/data/guests")
async def get_guests(room: Optional[str] = None):
    return await oscar_db.get_guests(room_code=room)


@app.get("/data/guests_with_scores")
async def get_guests_with_scores(room: Optional[str] = None):
    return await oscar_db.get_guests_with_scores(room_code=room)


@app.get("/data/guests/{guest_id}")
async def get_guest(guest_id: int):
    guest = await oscar_db.get_guest_by_id(guest_id)
    if guest:
        return {
            "id": guest.doc_id,
            "name": guest["name"],
            "photo": guest.get("photo", ""),
            "predictions": guest.get("predictions", {}),
            "rooms": guest.get("rooms", [])
        }
    return Response(status_code=404)


@app.post("/data/guests")
async def create_guest(guest: GuestCreate):
    guest_id = await oscar_db.create_guest(
        name=guest.name,
        photo=guest.photo,
        predictions=guest.predictions,
        guest_rooms=guest.rooms
    )
    return {"id": guest_id}


@app.put("/data/guests/{guest_id}")
async def update_guest(guest_id: int, guest: GuestUpdate):
    await oscar_db.update_guest(
        guest_id=guest_id,
        name=guest.name,
        photo=guest.photo,
        predictions=guest.predictions,
        guest_rooms=guest.rooms
    )
    return Response(status_code=200)


@app.delete("/data/guests/{guest_id}")
async def delete_guest(guest_id: int):
    await oscar_db.delete_guest(guest_id)
    return Response(status_code=204)


@app.get("/data/app_state")
async def get_app_state():
    return await oscar_db.get_app_state()


@app.post("/data/app_state/lock")
async def set_predictions_lock(lock_data: LockPredictions):
    await oscar_db.set_predictions_locked(lock_data.locked)
    return Response(status_code=200)


@app.post("/data/app_state/winner")
async def set_winner(winner_data: SetWinner):
    await oscar_db.set_winner(winner_data.award_id, winner_data.nominee_id)
    return Response(status_code=200)


@app.delete("/data/app_state/winner/{award_id}")
async def clear_winner(award_id: int):
    await oscar_db.clear_winner(award_id)
    return Response(status_code=204)


@app.post("/data/app_state/reset")
async def reset_app_state():
    await oscar_db.reset_app_state()
    return Response(status_code=200)


@app.post("/upload/photo")
async def upload_photo(file: UploadFile = File(...)):
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(helper.find_root(), "data", "guests", unique_filename)

    # Save file
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    return {"filename": unique_filename, "path": f"guests/{unique_filename}"}


@app.delete("/data/guests")
async def clear_all_guests():
    await oscar_db.clear_guests()
    return Response(status_code=204)


@app.post("/data/note")
async def set_note(note: Note):
    await db.update_note(note.text)
    return Response(status_code=200)


@app.get("/data/scores")
async def get_scores():
    return await db.get_scores()


@app.delete("/data/scores")
async def delete_scores():
    await db.clear_scores()
    return Response(status_code=204)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print("received msg: " + data)
            data_list = data.split("+++")

            if data_list[0] == "setScore":
                await db.add_score(data_list[1], data_list[2], data_list[3])

            # Oscar Predictions WebSocket handlers
            elif data_list[0] == "lockPredictions":
                await oscar_db.set_predictions_locked(True)

            elif data_list[0] == "unlockPredictions":
                await oscar_db.set_predictions_locked(False)

            elif data_list[0] == "setCurrentAward":
                award_id = int(data_list[1]) if len(data_list) > 1 else None
                await oscar_db.set_current_award(award_id)

            elif data_list[0] == "selectWinner":
                if len(data_list) >= 3:
                    award_id = int(data_list[1])
                    nominee_id = int(data_list[2])
                    await oscar_db.set_winner(award_id, nominee_id)

            if data_list[0] == "__ping__":
                await websocket.send_text("__pong__")
            else:
                await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def start_file_generation():
    while True:
        await generate_files()
        await asyncio.sleep(1)


def show_window():
    if easygui:
        easygui.msgbox("Oscar Predictions App launched!\n\nTo use the application, open a browser.\n\nFor guests to submit predictions:\n\nhttp://" + helper.get_ip() + ":8001/home/guest.html\n\nFor the audience display screen:\n\nhttp://" + helper.get_ip() + ":8001/home/screen.html\n\nFor the admin control panel:\n\nhttp://" + helper.get_ip() +
                       ":8001/home/assistant.html\n\nYou can open the websites on any device (including Android/iOS) in your private WiFi network.\n\nNote that closing this window does not stop the application. Closing the black command prompt window does.", "Successfully started")


@app.on_event("startup")
async def startup_event():
    if easygui:
        file_generation_thread = threading.Timer(0, show_window)
        file_generation_thread.daemon = True
        file_generation_thread.start()

    loop = asyncio.get_running_loop()
    loop.create_task(start_file_generation())


def start_server():
    multiprocessing.freeze_support()
    uvicorn.run(app, host="0.0.0.0", port=8001, loop='asyncio')


if __name__ == "__main__":
    start_server()
