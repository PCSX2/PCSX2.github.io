# PCSX2.github.io

This repository has two main things
- static content served via github-pages in `/docs`
- a very small backend server to support this static content page

## Developing on the Backend

- TODO
- `git subtree push --prefix backend heroku master`


## for deploy
- fix branches, merge to master
- server has to have ssh access to this repo
  - https://github.com/vicenteguerra/git-deploy
- personal access token created and used
- archive repo has to add a webhook to the server
- main repo has to add a webhook to the server

- fix stable release on upstream to have the right format

- setup status page
