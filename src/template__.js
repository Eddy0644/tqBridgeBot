let env;
function test(){
    return env.a;
}
module.exports = (incomingEnv)=>{
    env=incomingEnv;
    return {
        test
    };
};