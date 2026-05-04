# dialogue-systems-1-2026

## How to deploy your app
1.  Modify the `build` script in `package.json` file:

    "build": "tsc && vite build --base ./",

2.  Use SSH to login to **mltgpu-2**.
3.  Create a folder inside `/srv/www/` path (first, `cd /srv/www/`) with the same name as your gus-account, e.g. `gusxxxxxx`.
4.  On your machince, build your app: `npm run build`, this will produce a `dist` directory with a few files in it. (More information can be found in [Vite documentation](https://vitejs.dev/guide/build.html)). 
    - If you are getting errors, you might consider excluding files that you are not using `tsconfig.json` (i.e. `"exclude": ["src/dmParallel.ts", "src/dm2.ts"]`). You can also relax other TypeScript checks, e.g. `"noUnusedLocals": false`.
5.  Copy the contents of this directory to your folder on the server:
    
        scp -P <PORT> -r dist/* gusxxxxxx@mltgpu-2.flov.gu.se:/srv/www/gusxxxxxx/
        
6.  Access your app at <https://dev.clasp.gu.se/mltgpuweb/gusxxxxxx> (protected by password).

Note: in some cases, the access rights are incorrectly set. In this case you are likely to see the HTML page but other code won’t load. In this case run the following command in your `/srv/www/gusxxxxxx/` directory:
    
    chmod -R a+rX assets

