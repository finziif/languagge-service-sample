# 3cad README

This is the README for the extension "3cad". This is a beta version. 

## Installation

1 ready node environment, run cli:  `npm install -g vsce`
2 open [marketplace](https://marketplace.visualstudio.com/VSCode), sign in
3 click navbar YOUR NAME link (recommend), or menubar 'Publish extensions' link button;
4 "create new organization", continue until done ...
5 click organization, click the User Settings icon to the left of the avatar,
6 click 'Personal access tokens'
7 click 'new token',
- name is your extension name (kebab case),
- Organization must select All accessible organizations, otherwise throw "Error: Failed Request: Unauthorized(401)";
- Scopes → Show all scopes → "Marketplace" select Acquire+Publish, create...
8 copy token, backup to file or print it,
9 In the command line window, run  `vsce package`. This command create a `.vsix` file in root folder
10 Go this [page](https://marketplace.visualstudio.com/manage) and click on 'create publisher', 
11 Configure the publisher. Here the publisher name you input must same with the new publisher name you are using in `package.json`
12 Upload the `.vsix` file
**Enjoy!**
