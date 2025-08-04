## Steps to Deploy Your React App on Netlify via GitHub

### 1. Create a New Project on Netlify
- Go to [Netlify](https://app.netlify.com/) and log in or sign up.
- Click **"Add new site"** > **"Import an existing project"**.

### 2. Connect Your GitHub Repository
- Select **GitHub** as your Git provider.
- Authorize Netlify to access your GitHub account if prompted.
- Find and select your repository (`sam2-fe`).

### 3. Configure Continuous Deployment
- In the setup, choose the **main** branch for automatic deployments.
- Netlify will build and deploy your app every time you push to the main branch.

### 4. Set Environment Variables
- In the **"Site settings"** during setup, scroll to **"Environment variables"**.
- Add the following variables using your deployed Beam Cloud backend URL and token:

  ```properties
  VITE_APP_BACKEND_URL=<your_beam_cloud_backend_url>
  VITE_APP_TOKEN=<your_beam_cloud_token>
  ```
Netlify will automatically build and deploy your app.
You can update environment variables anytime in Site Settings > Environment Variables and redeploy.