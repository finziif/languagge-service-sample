# 3cad README

This is the README for the extension "3cad". This is a beta version. 

## Installation
1 Run:  `npm install` to install dependecies and then run `npm run compile` to compile files .ts \
2 ready node environment, run cli:  `npm install -g vsce` \
3 open [marketplace](https://marketplace.visualstudio.com/VSCode), sign in \
4 click navbar YOUR NAME link (recommend), or menubar 'Publish extensions' link button; \
5 "create new organization", continue until done ... \
6 click organization, click the User Settings icon to the left of the avatar \
7 click 'Personal access tokens' \
8 click 'new token'
- name is your extension name (kebab case),
- Organization must select All accessible organizations, otherwise throw "Error: Failed Request: Unauthorized(401)";
- Scopes → Show all scopes → "Marketplace" select Acquire+Publish, create...
9 copy token, backup to file or print it \
10 In the command line window, run  `vsce package`. This command create a `.vsix` file in root folder \
11 Go this [page](https://marketplace.visualstudio.com/manage) and click on 'create publisher', \
12 Configure the publisher. Here the publisher name you input must same with the new publisher name you are using in `package.json` \
13 Upload the `.vsix` file \