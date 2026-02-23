import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800">頁面未找到</h1>
      <p className="text-gray-500 mt-2">即將推出...</p>
      <Link to="/" className="btn btn-primary mt-4 inline-block">返回首頁</Link>
    </div>
  );
}
