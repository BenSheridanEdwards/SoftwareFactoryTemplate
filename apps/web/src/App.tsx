import { GreetingPage } from './routes/greeting';
import { RecentGreetingsPage } from './routes/recent-greetings';
import { TodosPage } from './routes/todos';

export function App() {
  if (globalThis.location?.pathname === '/todos') {
    return <TodosPage />;
  }
  return (
    <>
      <GreetingPage />
      <RecentGreetingsPage />
    </>
  );
}
