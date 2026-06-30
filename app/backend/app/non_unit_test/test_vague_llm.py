# this test is to test how LLM handles vague instructions without our UI component yet.

import asyncio
from typing import Optional

import httpx

BASE_URL = "http://localhost:8000/api/v1"
EMAIL = "vague-test@test.com"
PASSWORD = "password123"


async def register_and_login() -> str:
    async with httpx.AsyncClient() as client:
        # try register, ignore 400 if the user already exists from a previous run
        await client.post(f"{BASE_URL}/auth/register",
            json={"name": "Test", "email": EMAIL, "password": PASSWORD})
        resp = await client.post(f"{BASE_URL}/auth/login",
            json={"email": EMAIL, "password": PASSWORD})
        token = resp.json()["access_token"]

        # connect to the Canvas sandbox automatically so every run is ready to test
        await client.patch(
            f"{BASE_URL}/auth/me/canvas-token",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "canvas_token": "canvas-docker",
                "canvas_url": "http://localhost:3000",
            },
        )
        return token


async def chat(token: str, message: str, conversation_id: Optional[int] = None) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{BASE_URL}/chat/",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": message, "conversation_id": conversation_id or 0},
        )
        return resp.json()


async def confirm(token: str, conversation_id: int, proposed_action: dict) -> dict:
    """Executes a previously-proposed action directly, bypassing the LLM.
    This is what should run when the user confirms an intent_preview."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{BASE_URL}/chat/confirm",
            headers={"Authorization": f"Bearer {token}"},
            json={"conversation_id": conversation_id, "proposed_action": proposed_action},
        )
        return resp.json()


async def main():
    print("Registering test user...")
    token = await register_and_login()
    conversation_id = None

    print("\n--- Canvas LMS Assistant Terminal Test ---")
    print("Type 'quit' to exit\n")

    while True:
        message = input("You: ").strip()
        if message.lower() == "quit":
            break

        result = await chat(token, message, conversation_id)
        conversation_id = result.get("conversation_id")
        reply = result.get("reply", {})

        if reply.get("out_of_scope"):
            print(f"\nAssistant: {reply['message']}\n")

        elif reply.get("clarify"):
            print(f"\nAssistant (needs clarification): {reply['question']}")
            print(f"[Partial plan so far: {reply['partial_plan']}]\n")

        elif reply.get("intent_preview"):
            print(f"\nAssistant (about to execute): {reply['summary']}")
            print(f"[Proposed action: {reply['proposed_action']}]")
            confirm_choice = input("Confirm? (yes / modify / cancel): ").strip().lower()

            if confirm_choice == "yes":
                # bypasses the LLM entirely — executes the exact proposed_action
                result2 = await confirm(token, conversation_id, reply["proposed_action"])
                print(f"\nResult: {result2.get('reply')}\n")
            elif confirm_choice == "modify":
                modification = input("What to change? ").strip()
                result2 = await chat(token, modification, conversation_id)
                print(f"\nAssistant: {result2.get('reply')}\n")
            else:
                print("Cancelled.\n")

        else:
            print(f"\nAssistant: {reply}\n")


if __name__ == "__main__":
    asyncio.run(main())