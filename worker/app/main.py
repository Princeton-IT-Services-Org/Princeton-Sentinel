from app.api import create_app
from app.heartbeat import start_heartbeat_thread
from app.scheduler import start_scheduler_thread

app = create_app()
start_scheduler_thread()
start_heartbeat_thread()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
