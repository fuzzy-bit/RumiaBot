import { CONFIG } from "../MODULES/CONFIG.js";
import { MessageEmbed } from "discord.js";
import { client } from "../MODULES/loadClient.js";
import { WebSocket } from "ws";
import { SQL_OBJ } from "../Main.js";
import { general_channel, rumiserver } from "../MODULES/SYNTAX_SUGER.js";

export class SNS {
	constructor() {
		this.USER = [];
	}

	//SQLを再読込するやつ
	SQL_RELOAD() {
		//VSCさ、勝手にコード変えるのまじでやめてくれん？
		SQL_OBJ.SCRIPT_RUN("SELECT * FROM `SNS`; ", [])
			.then(RESULT => {
				this.USER = RESULT;
			})
			.catch(EX => {
				console.error("[ OK ][ MISSKEY ]SQL ERR:" + EX);
			});
	}

	//ごちゃごちゃ
	main() {
		this.SQL_RELOAD();

		CONFIG.SNS.forEach(ROW => {
			switch (ROW.TYPE) {
				case "MISSKEY":
					this.misskey(ROW.DOMAIN, ROW.API, ROW.ID);
					break;
				case "MASTODON":
					this.mastodon(ROW.DOMAIN, ROW.API, ROW.ID);
					break;
			}
		});
	}

	async SEND_EMBEDED(GID, CID, AUTHOR, POST, REPOST, FILES, SNS_TYPE) {
		try{
			const EB = new MessageEmbed();

			//SNSのタイプに寄って埋め込みの形式を買える
			switch(SNS_TYPE){
				case "MISSKEY":
					//タイトル(どこからの投稿か)
					EB.setTitle("Misskeyの投稿");
					//色
					EB.setColor("#86B300");
					break;
				case "MASTODON":
					//タイトル(どこからの投稿か)
					EB.setTitle("Mastodonの投稿");
					//色
					EB.setColor("#A200FF");
					break;
				case "FIRE_FISH":
					//タイトル(どこからの投稿か)
					EB.setTitle("FireFishの投稿");
					//色
					EB.setColor("#FF9900");
					break;
				default:
					//タイトル(どこからの投稿か)
					EB.setTitle("不明");
					//色
					EB.setColor("#A85100");
					break;
			}
	
			//投稿者
			EB.setAuthor({
				"name":AUTHOR.NAME,
				"iconURL":AUTHOR.AVATAR,
				"url":AUTHOR.PROF
			});
	
			//投稿の本文
			if(POST.TEXT){
				if(POST.TEXT.length < 1024){
					EB.setDescription(POST.TEXT);
				}else{
					EB.setDescription(POST.TEXT.slice(0, 1000) + "...");
				}
			}
	
			//投稿のURL
			EB.setURL(POST.URL);
	
			//投稿の画像
			if(FILES.POST_FILE){//投稿に添付されている画像がある
				if(!FILES.POST_FILE.NSFW){
					EB.setImage(FILES.POST_FILE.URL);
				}
			}else if(FILES.RENOTE_FILE){//画像がないので、引用に付いている画像があるか
				if(!FILES.RENOTE_FILE.NSFW){
					EB.setImage(FILES.RENOTE_FILE.URL);
				}
			}//画像は何も無かった
	
			//投稿日時
			EB.setTimestamp(new Date(POST.DATE));
	
			//引用元
			if(REPOST){
				if(REPOST.POST.TEXT.length < 1024){
					EB.addFields({
						"name":"「" + REPOST.AUTHOR.NAME + "」の投稿を引用",
						"value":REPOST.POST.TEXT
					});
				}else{
					EB.addFields({
						"name":"「" + REPOST.AUTHOR.NAME + "」の投稿を引用",
						"value":REPOST.POST.TEXT.slice(0, 1000) + "..."
					});
				}
			}
	
			await client.guilds.cache.get(GID).channels.cache.get(CID).send({ embeds: [EB] });
		}catch(EX){
			console.log("[ ERR ][ SNS ]" + EX);
		}
	}

	misskey(DOMAIN, API_TOKEN, ID) {
		//WebSocketサーバーのURL
		const serverURL = "wss://" + DOMAIN + "/streaming?i=" + API_TOKEN;

		//WebSocket接続を作成
		const socket = new WebSocket(serverURL);

		//接続が確立された際のイベントハンドラ
		socket.on("open", () => {
			console.log("[ OK ][ MISSKEY ][ " + DOMAIN + " ]WS Connected!");

			//メッセージをサーバーに送信
			socket.send('{"type":"connect","body":{"channel":"localTimeline","id":"1","params":{"withReplies":false}}}');
		});

		//サーバーからメッセージを受信した際のイベントハンドラ
		socket.on("message", async(DATA) => {
			try {
				const RESULT = JSON.parse(DATA);

				if (RESULT.body.type === "note" && RESULT.body.body.replyId === null) {
					//投稿者のID
					let IT_MIS_USER = RESULT.body.body.user;
					//SQLにそのIDがあるか探す
					let IT_DIS_USER = [];

					for (let I = 0; I < this.USER.length; I++) {
						const SNS_USER = this.USER[I];
						if (SNS_USER.SNS_UID === IT_MIS_USER.id && SNS_USER.SNS_ID === ID) {
							IT_DIS_USER.push(SNS_USER);
						}
					}

					//Ej! そのIDはあるか？？？
					if (IT_DIS_USER.length > 0) {
						let NOTE_ID = RESULT.body.body.id; //ノートのID
						let NOTE_TEXT = RESULT.body.body.text; //ノートのテキスト
						let NOTE_FILES = RESULT.body.body.files; //ノートのファイル
						let RENOTE_NOTE = RESULT.body.body.renote; //リノートのデータ

						console.log("[ INFO ][ MISSKEY ]Note res:" + NOTE_ID); //ログを吐く
						IT_DIS_USER.forEach(async(ROW) => {
							await this.SEND_EMBEDED(
								ROW.GID,
								ROW.CID,
								{//投稿者の情報
									"NAME":IT_MIS_USER.name,
									"AVATAR":IT_MIS_USER.avatarUrl,
									"PROF":"https://" + DOMAIN + "/@" + IT_MIS_USER.username
								},
								//ノートの情報
								{
									"TEXT":NOTE_TEXT,
									"URL":"https://" + DOMAIN + "/notes/" + NOTE_ID,
									"DATE":RESULT.body.body.createdAt
								},
								(function(){
									if(RENOTE_NOTE){
										return {
											"AUTHOR":{
												"NAME":RENOTE_NOTE.user.name,
												"AVATAR":RENOTE_NOTE.user.avatarUrl,
												"PROF":"https://" + DOMAIN + "/@" + RENOTE_NOTE.user.username
											},
											"POST":{
												"TEXT":RENOTE_NOTE.text,
												"URL":"https://" + DOMAIN + "/notes/" + RENOTE_NOTE.id,
												"DATE":RENOTE_NOTE.createdAt
											}
										};
									}
								})(),
								{
									"POST_FILE":(function(){
										if(NOTE_FILES.length > 0){
											return {
												"URL":NOTE_FILES[0].thumbnailUrl,
												"NSFW":NOTE_FILES[0].isSensitive
											};
										}
									})(),
									"RENOTE_FILE":(function(){
										if(RENOTE_NOTE){
											if(RENOTE_NOTE.files.length > 0){
												return {
													"URL":RENOTE_NOTE.files[0].thumbnailUrl,
													"NSFW":RENOTE_NOTE.files[0].isSensitive
												};
											}
										}
									})()
								},
								"MISSKEY"
							);
						});
					}
				}
			} catch (EX) {
				console.error("[ ERR ][ MISSKEY ][ " + DOMAIN + " ]" + EX);
				return;
			}
		});

		//エラー発生時のイベントハンドラ
		socket.on("error", ERR => {
			console.error("エラーが発生しました:", ERR);
		});

		//接続が閉じられた際のイベントハンドラ
		socket.on("close", (CODE, REASON) => {
			console.log("[ INFO ][ MISSKEY ][ " + DOMAIN + " ]Disconnected!" + CODE + "REASON:" + REASON);
			clearInterval(SEND_H);
			setTimeout(() => {
				console.log("[ *** ][ MISSKEY ][ " + DOMAIN + " ]Re Connecting...");
				this.misskey(DOMAIN, API_TOKEN, ID); //再接続する
			}, 5000);
		});

		let SEND_H = setInterval(() => {
			socket.send("h");
		}, 60000);
	}

	mastodon(DOMAIN, API_TOKEN, ID) {
		//WebSocketサーバーのURL
		const serverURL = "wss://" + DOMAIN + "/api/v1/streaming?access_token=" + API_TOKEN;

		//WebSocket接続を作成
		const socket = new WebSocket(serverURL);

		//接続が確立された際のイベントハンドラ
		socket.on("open", () => {
			console.log("[ OK ][ MASTODON ][ " + DOMAIN + " ]WS Connected!");

			//メッセージをサーバーに送信
			socket.send('{"type":"subscribe","stream":"public:local"}');
		});

		//サーバーからメッセージを受信した際のイベントハンドラ
		socket.on("message", async(DATA) => {
			try {
				const RESULT = JSON.parse(DATA);
				
				//トゥートされたら実行する
				if (RESULT.event === "update") {
					const TOOT = JSON.parse(RESULT.payload);

					//横流しするチャンネル
					let STREAM_CHANNEL = [];
					//流すチャンネルを選別する
					for (let I = 0; I < this.USER.length; I++) {
						const SNS_USER = this.USER[I];
						//UIDが一致していて、インスタンスのIDも一致しているなら
						if (SNS_USER.SNS_UID === TOOT.account.id && SNS_USER.SNS_ID === ID) {
							//追加
							STREAM_CHANNEL.push(SNS_USER);
						}
					}

					let TOOT_TEXT = TOOT.content;
					//トゥートの文字列を痴漢する
					TOOT_TEXT = TOOT_TEXT.replaceAll(/<br.*?>/g, "\n"); //改行
					TOOT_TEXT = TOOT_TEXT.replaceAll(/<.*?>/g, ""); //その他のタグ
					TOOT_TEXT = TOOT_TEXT.replaceAll("&gt;", ">"); //その他のタグ
					TOOT_TEXT = TOOT_TEXT.replaceAll("&lt;", "<"); //その他のタグ

					//横流しするチャンネルを回して流す
					STREAM_CHANNEL.forEach(async(ROW) => {
						await this.SEND_EMBEDED(
							ROW.GID,
							ROW.CID,
							{//投稿者の情報
								"NAME":TOOT.account.display_name,
								"AVATAR":TOOT.account.avatar,
								"PROF":"https://" + DOMAIN + "/@" + TOOT.account.username
							},
							//ノートの情報
							{
								"TEXT":TOOT_TEXT,
								"URL":"https://" + DOMAIN + "/@" + TOOT.account.username + "/" + TOOT.id,
								"DATE":TOOT.created_at
							},
							undefined,
							{
								"POST_FILE":(function(){
									if(TOOT.media_attachments.length > 0){
										if(TOOT.media_attachments.type === "image"){
											return {
												"URL":TOOT.media_attachments[0].preview_url,
												"NSFW":false
											};
										}
									}
								})(),
								"RENOTE_FILE":undefined
							},
							"MASTODON"
						);
					});
				}
			} catch (EX) {
				console.error("[ ERR ][ MASTODON ][ " + DOMAIN + " ]" + EX);
				return;
			}
		});

		//エラー発生時のイベントハンドラ
		socket.on("error", ERR => {
			console.error("エラーが発生しました:", ERR);
		});

		//接続が閉じられた際のイベントハンドラ
		socket.on("close", (CODE, REASON) => {
			console.log("[ INFO ][ MASTODON ][ " + DOMAIN + " ]Disconnected!" + CODE + "REASON:" + REASON);

			setTimeout(() => {
				console.log("[ *** ][ MASTODON ][ " + DOMAIN + " ]Re Connecting...");
				this.mastodon(DOMAIN, API_TOKEN, ID); //再接続する
			}, 5000);
		});
	}
}
