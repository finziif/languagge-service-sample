# README

This is the README for the extension. This is a beta version. 

> [!NOTE]
> To quickly create a new grammar extension, I use VS Code's Yeoman templates. To install it use `npm install yo generator-code` and to run it use `yo code`


## Installation


1. Run: `npm install` to install dependecies  

2. Run `npm run compile` to compile files .ts 

3. If you use visual studio code as editor, you can use the launch.json file inside the folder .vscode to test your extension in the editor. If you do not use visual studio code, you can delete the folder .vscode


## Testing 


1. Run `npm install -g vsce` .

2. Run `vsce package`. This command create a `.vsix` file in root folder.

3. Click on extension editor and install a `.vsix` file.

4. Now you can test the LSP Extension


## Publish


1. Open [marketplace](https://marketplace.visualstudio.com/VSCode), sign in

2. Click navbar YOUR NAME link (recommend), or menubar 'Publish extensions' link button;

3. "create new organization", continue until done ...

4. click organization, click the User Settings icon to the left of the avatar

5. click 'Personal access tokens'

6. click 'new token' 

    - Name is your extension name (kebab case),

    - Organization must select All accessible organizations, otherwise throw "Error: Failed Request: Unauthorized(401)";

    - Scopes → Show all scopes → "Marketplace" select Acquire+Publish, create... 

7. Copy token, backup to file or print it 

8. Go this [page](https://marketplace.visualstudio.com/manage) and click on 'create publisher', 

9. Configure the publisher. Here the publisher name you input must same with the new publisher name you are using in `package.json` 

10. Upload the `.vsix` file 
