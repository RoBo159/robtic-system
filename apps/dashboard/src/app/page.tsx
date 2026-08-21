import { publicApiUrl } from "@/lib/api.server";

export default function LandingPage() {
    return (
        <main className="centered">
            <div>
                <h1 className="page-title">Robtic Dashboard</h1>
                <p className="page-lede">
                    Configure the bot for the servers you manage — settings, moderation history, quests and economy.
                </p>
                {
                  }
                <a href={`${publicApiUrl()}/auth/login`}>
                    <button>Sign in with Discord</button>
                </a>
            </div>
        </main>
    );
}
