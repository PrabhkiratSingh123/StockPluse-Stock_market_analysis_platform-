# StockPulse 📈

StockPulse is a comprehensive full-stack stock market analysis and trading simulation platform. It features a robust Django backend for financial data processing, machine learning predictions, and portfolio management, coupled with a dynamic React frontend for an intuitive user experience.

## 🌟 Key Features

*   **User Authentication:** Secure JWT-based authentication with user profiles.
*   **Virtual Wallet:** Simulated wallet system for deposits, withdrawals, and tracking balances.
*   **Trading Simulation:** Buy and sell stocks using virtual funds.
*   **Portfolio Management:** Track your investments and view transaction history.
*   **Machine Learning Integration:** Utilizes powerful libraries (scikit-learn, XGBoost, CatBoost, LightGBM) for advanced market analysis and predictions.
*   **Real-time Data:** Fetches market data using `yfinance`.
*   **Interactive Charts:** Beautiful data visualization using ApexCharts and Recharts.
*   **API Documentation:** Built-in Swagger and ReDoc UI for API exploration.

## 🛠️ Technology Stack

### Backend
*   **Framework:** Django 6.0, Django REST Framework
*   **Database:** PostgreSQL (Production) / SQLite (Development)
*   **Authentication:** Simple JWT
*   **Data Science & ML:** Pandas, NumPy, Scikit-learn, XGBoost, LightGBM, CatBoost, SciPy
*   **External APIs:** yfinance
*   **Documentation:** drf-yasg (Swagger/OpenAPI)

### Frontend
*   **Framework:** React 19, Vite
*   **Styling:** Tailwind CSS v4
*   **Charting:** ApexCharts, Recharts
*   **Routing:** React Router DOM v7
*   **HTTP Client:** Axios

### DevOps
*   **Containerization:** Docker, Docker Compose
*   **CI/CD:** GitHub Actions (Automated testing for Django and React)
*   **Deployment:** Configured for Render (`render.yml`)

## 🚀 Getting Started (Local Development)

### Prerequisites
*   Docker and Docker Compose installed on your machine.

### Running with Docker Compose (Recommended)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/PrabhkiratSingh123/StockPluse-Stock_market_analysis_platform-.git
    cd StockPluse-Stock_market_analysis_platform-
    ```

2.  **Start the application:**
    ```bash
    docker-compose up --build
    ```

3.  **Access the services:**
    *   Frontend: `http://localhost:5173`
    *   Backend API: `http://localhost:8000`
    *   Swagger API Docs: `http://localhost:8000/swagger/`
    *   Django Admin: `http://localhost:8000/admin/`

### Manual Setup

#### Backend Setup
```bash
cd backend
python -m venv venv
# Activate virtual environment (Windows: venv\Scripts\activate, Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

#### Frontend Setup
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

## 🧪 Testing

The project uses GitHub Actions for Continuous Integration.

To run tests locally:

**Backend:**
```bash
cd backend
python manage.py test
```

**Frontend:**
```bash
cd frontend
npm run lint
npm run build
```

## 📁 Project Structure

*   `/backend`: Django REST API, Machine Learning models, and database configurations.
    *   `users`: User management, authentication, wallet, and profiles.
    *   `portfolio`: User portfolio tracking.
    *   `trading`: Stock trading logic and simulation.
*   `/frontend`: React application, components, and views.
*   `.github/workflows`: CI/CD pipeline configurations.
